import Foundation

final class ProbeElement {
    let name: String
    let namespace: String
    let attributes: [String: String]
    var children: [ProbeElement] = []
    var text = ""

    init(name: String, namespace: String, attributes: [String: String]) {
        self.name = name
        self.namespace = namespace
        self.attributes = attributes
    }
}

final class ProbeXML: NSObject, XMLParserDelegate {
    var root: ProbeElement?
    var stack: [ProbeElement] = []
    var count = 0
    var rejected = false

    static func parse(_ message: String) throws -> ProbeElement {
        guard message.utf8.count <= 65536, !message.contains("<!"), !message.contains("<?") else {
            throw ConnectionFailure.invalidResponse
        }
        let delegate = ProbeXML()
        let parser = XMLParser(data: Data(message.utf8))
        parser.shouldProcessNamespaces = true
        parser.shouldResolveExternalEntities = false
        parser.delegate = delegate
        guard parser.parse(), !delegate.rejected, delegate.stack.isEmpty, let root = delegate.root else {
            throw ConnectionFailure.invalidResponse
        }
        return root
    }

    func reject(_ parser: XMLParser) {
        rejected = true
        parser.abortParsing()
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName: String?, attributes attributeDict: [String: String]) {
        count += 1
        guard count <= 128, stack.count < 8, attributeDict.count <= 16,
              attributeDict.values.allSatisfy({ $0.utf8.count <= 1024 }) else {
            reject(parser)
            return
        }
        let element = ProbeElement(name: elementName, namespace: namespaceURI ?? "", attributes: attributeDict)
        if let parent = stack.last { parent.children.append(element) }
        else if root == nil { root = element }
        else { reject(parser); return }
        stack.append(element)
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName: String?) {
        _ = stack.popLast()
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if let element = stack.last { element.text += string }
        else if !string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { reject(parser) }
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) { reject(parser) }
}

public struct XMPPProbeStream {
    private static let framing = "urn:ietf:params:xml:ns:xmpp-framing"
    private static let streams = "http://etherx.jabber.org/streams"
    private static let sasl = "urn:ietf:params:xml:ns:xmpp-sasl"
    private var receivedOpen = false
    private var finished = false
    private var bytes = 0

    public init() {}

    public static func opening(for configuration: ServerConfiguration) -> String {
        "<open xmlns=\"\(framing)\" to=\"\(configuration.domain)\" version=\"1.0\"/>"
    }

    public mutating func receive(_ message: String) throws -> ProbeReport? {
        guard !finished else { throw ConnectionFailure.invalidResponse }
        do {
            return try parse(message)
        } catch {
            finished = true
            throw error
        }
    }

    private mutating func parse(_ message: String) throws -> ProbeReport? {
        bytes += message.utf8.count
        guard bytes <= 65536, !message.contains("<!"), !message.contains("<?") else {
            throw ConnectionFailure.invalidResponse
        }
        let root = try ProbeXML.parse(message)
        if !receivedOpen {
            guard root.name == "open", root.namespace == Self.framing,
                  root.attributes["version"] == "1.0", !(root.attributes["id"] ?? "").isEmpty,
                  root.children.isEmpty, root.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw ConnectionFailure.invalidResponse
            }
            receivedOpen = true
            return nil
        }
        guard root.name == "features", root.namespace == Self.streams,
              root.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ConnectionFailure.invalidResponse
        }
        let containers = root.children.filter { $0.name == "mechanisms" && $0.namespace == Self.sasl }
        guard containers.count == 1, let container = containers.first,
              container.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !container.children.isEmpty else { throw ConnectionFailure.invalidResponse }
        var mechanisms = Set<String>()
        for mechanism in container.children {
            let name = mechanism.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard mechanism.name == "mechanism", mechanism.namespace == Self.sasl,
                  mechanism.children.isEmpty,
                  name.range(of: #"\A[A-Z0-9_-]{1,20}\z"#, options: .regularExpression) != nil,
                  mechanisms.insert(name).inserted else { throw ConnectionFailure.invalidResponse }
        }
        finished = true
        return ProbeReport(mechanisms: mechanisms)
    }
}
