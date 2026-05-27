namespace Tiedragon.XmppMessenger.Core.Messaging;

public sealed record LegacySmileyDefinition(
    string Name,
    string FileName,
    IReadOnlyList<string> Codes);

public sealed record LegacySmileyToken(
    LegacySmileyTokenKind Kind,
    string Text,
    LegacySmileyDefinition? Smiley = null);

public enum LegacySmileyTokenKind
{
    Text,
    Smiley
}

public static class LegacySmileyCatalog
{
    public static IReadOnlyList<LegacySmileyDefinition> Definitions { get; } =
    [
        Definition("biggrin", "biggrin.gif", ":D"),
        Definition("bonk", "bonk.gif", "8)7"),
        Definition("bonk3", "bonk3.gif", "7(8)7"),
        Definition("bye", "bye.gif", ":w"),
        Definition("clown", "clown.gif", ":+"),
        Definition("confused", "confused.gif", ":?"),
        Definition("coool", "coool.gif", "8)"),
        Definition("cry", "cry.gif", ":'("),
        Definition("devil", "devil.gif", ">:)" ),
        Definition("devilish", "devilish.gif", "})"),
        Definition("frown", "frown.gif", ":("),
        Definition("frusty", "frusty.gif", "|:("),
        Definition("heart", "heart.gif", "O+"),
        Definition("hypocrite", "hypocrite.gif", "O-)"),
        Definition("kwijl", "kwijl.gif", ":9~"),
        Definition("loveit", "loveit.gif", ":7"),
        Definition("loveys", "loveys.gif", "*;"),
        Definition("marrysmile", "marrysmile.gif", "^)"),
        Definition("michel", "michel.gif", "(8>"),
        Definition("nerd", "nerd.gif", "B)"),
        Definition("nosmile", "nosmile.gif", ":/"),
        Definition("nosmile2", "nosmile2.gif", ":|"),
        Definition("puh", "puh.gif", ":>", ":*"),
        Definition("puh2", "puh2.gif", ":P"),
        Definition("pukey", "pukey.gif", ":r"),
        Definition("rc5", "rc5.gif", "}:O"),
        Definition("redface", "redface.gif", ":o"),
        Definition("sadley", "sadley.gif", ";("),
        Definition("shadey", "shadey.gif", "B-)"),
        Definition("shiny", "shiny.gif", ":*)"),
        Definition("shutup", "shutup.gif", ":X"),
        Definition("sintsmiley", "sintsmiley.gif", "<+:)"),
        Definition("sleepey", "sleepey.gif", ":Z"),
        Definition("sleephappy", "sleephappy.gif", ":z"),
        Definition("smile", "smile.gif", ":)"),
        Definition("thumbsup", "thumbsup.gif", "d:)b"),
        Definition("vork", "vork.gif", ":Y)"),
        Definition("wink", "wink.gif", ";)"),
        Definition("worshippy", "worshippy.gif", "_/-\\o_", "_o_"),
        Definition("yawnee", "yawnee.gif", ":O"),
        Definition("yummie", "yummie.gif", ":9")
    ];

    private static readonly IReadOnlyList<(string Code, LegacySmileyDefinition Definition)> CodeIndex =
        Definitions
            .SelectMany(definition => definition.Codes.Distinct(StringComparer.Ordinal)
                .Select(code => (Code: code, Definition: definition)))
            .OrderByDescending(item => item.Code.Length)
            .ThenBy(item => item.Code, StringComparer.Ordinal)
            .ToArray();

    public static bool TryFindByCode(string code, out LegacySmileyDefinition? definition)
    {
        definition = CodeIndex
            .Where(item => string.Equals(item.Code, code, StringComparison.Ordinal))
            .Select(item => item.Definition)
            .FirstOrDefault();

        return definition is not null;
    }

    public static IReadOnlyList<LegacySmileyToken> Tokenize(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return [];
        }

        var tokens = new List<LegacySmileyToken>();
        var textStart = 0;
        var index = 0;

        while (index < text.Length)
        {
            var match = CodeIndex.FirstOrDefault(item =>
                index + item.Code.Length <= text.Length
                && string.CompareOrdinal(text, index, item.Code, 0, item.Code.Length) == 0);

            if (match.Definition is null)
            {
                index++;
                continue;
            }

            if (index > textStart)
            {
                tokens.Add(new LegacySmileyToken(
                    LegacySmileyTokenKind.Text,
                    text[textStart..index]));
            }

            tokens.Add(new LegacySmileyToken(
                LegacySmileyTokenKind.Smiley,
                match.Code,
                match.Definition));

            index += match.Code.Length;
            textStart = index;
        }

        if (textStart < text.Length)
        {
            tokens.Add(new LegacySmileyToken(
                LegacySmileyTokenKind.Text,
                text[textStart..]));
        }

        return tokens;
    }

    private static LegacySmileyDefinition Definition(string name, string fileName, params string[] codes)
    {
        return new LegacySmileyDefinition(name, fileName, codes);
    }
}

