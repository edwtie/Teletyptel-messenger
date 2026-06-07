<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppDataForm
{
    /**
     * @param array<int|string,mixed> $fields
     * @param list<string> $instructions
     */
    public static function formElement(array $fields = [], string $type = 'submit', ?string $title = null, array $instructions = []): string
    {
        $content = '';
        if ($title !== null && $title !== '') {
            $content .= XmppXml::textElement('title', XmppXml::DATA_FORM_NS, $title);
        }

        foreach ($instructions as $instruction) {
            if ($instruction !== '') {
                $content .= XmppXml::textElement('instructions', XmppXml::DATA_FORM_NS, $instruction);
            }
        }

        foreach ($fields as $key => $field) {
            if (is_array($field)) {
                $var = isset($field['var']) ? (string)$field['var'] : (is_string($key) ? $key : null);
                if ($var === null || $var === '') {
                    continue;
                }

                $values = $field['values'] ?? ($field['value'] ?? []);
                $content .= self::fieldElement(
                    $var,
                    $values,
                    $field['type'] ?? null,
                    $field['label'] ?? null,
                    (bool)($field['required'] ?? false),
                    $field['options'] ?? [],
                    $field['desc'] ?? null
                );
                continue;
            }

            if (is_string($key) && $key !== '') {
                $content .= self::fieldElement($key, $field);
            }
        }

        return '<x' . XmppXml::attributes(['xmlns' => XmppXml::DATA_FORM_NS, 'type' => $type]) . '>' . $content . '</x>';
    }

    /**
     * @param mixed $values
     * @param mixed $options
     */
    public static function fieldElement(
        string $var,
        mixed $values = [],
        ?string $type = null,
        ?string $label = null,
        bool $required = false,
        mixed $options = [],
        ?string $description = null
    ): string {
        $content = '';
        if ($description !== null && $description !== '') {
            $content .= XmppXml::textElement('desc', XmppXml::DATA_FORM_NS, $description);
        }

        if ($required) {
            $content .= '<required xmlns="' . XmppXml::DATA_FORM_NS . '"/>';
        }

        foreach (self::normalizeValues($values) as $value) {
            $content .= XmppXml::textElement('value', XmppXml::DATA_FORM_NS, $value);
        }

        foreach (self::normalizeOptions($options) as $option) {
            $optionContent = XmppXml::textElement('value', XmppXml::DATA_FORM_NS, $option['value']);
            $content .= '<option' . XmppXml::attributes(['xmlns' => XmppXml::DATA_FORM_NS, 'label' => $option['label']])
                . '>' . $optionContent . '</option>';
        }

        return '<field' . XmppXml::attributes(['xmlns' => XmppXml::DATA_FORM_NS, 'var' => $var, 'type' => $type, 'label' => $label])
            . '>' . $content . '</field>';
    }

    /**
     * @param array<string,mixed> $fields
     */
    public static function submitElement(string $formType, array $fields = []): string
    {
        return self::formElement(['FORM_TYPE' => ['type' => 'hidden', 'value' => $formType]] + $fields, 'submit');
    }

    /**
     * @return list<array{type:?string,title:?string,instructions:list<string>,fields:array<string,array{var:string,type:?string,label:?string,desc:?string,required:bool,values:list<string>,options:list<array{label:?string,value:string}>}>}>
     */
    public static function parseForms(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $forms = [];
        foreach ($xpath->query('//x:x') ?: [] as $node) {
            if ($node instanceof DOMElement) {
                $forms[] = self::parseFormElement($node);
            }
        }

        return $forms;
    }

    /**
     * @return array{type:?string,title:?string,instructions:list<string>,fields:array<string,array{var:string,type:?string,label:?string,desc:?string,required:bool,values:list<string>,options:list<array{label:?string,value:string}>}>}
     */
    public static function parseFormElement(DOMElement $form): array
    {
        $title = null;
        $instructions = [];
        $fields = [];

        foreach ($form->childNodes as $child) {
            if (!$child instanceof DOMElement || $child->namespaceURI !== XmppXml::DATA_FORM_NS) {
                continue;
            }

            if ($child->localName === 'title') {
                $title = $child->textContent;
                continue;
            }

            if ($child->localName === 'instructions') {
                $instructions[] = $child->textContent;
                continue;
            }

            if ($child->localName !== 'field') {
                continue;
            }

            $field = self::parseFieldElement($child);
            if ($field['var'] !== '') {
                $fields[$field['var']] = $field;
            }
        }

        return [
            'type' => $form->getAttribute('type') ?: null,
            'title' => $title,
            'instructions' => $instructions,
            'fields' => $fields,
        ];
    }

    /**
     * @return array{var:string,type:?string,label:?string,desc:?string,required:bool,values:list<string>,options:list<array{label:?string,value:string}>}
     */
    public static function parseFieldElement(DOMElement $field): array
    {
        $values = [];
        $options = [];
        $description = null;
        $required = false;

        foreach ($field->childNodes as $child) {
            if (!$child instanceof DOMElement || $child->namespaceURI !== XmppXml::DATA_FORM_NS) {
                continue;
            }

            if ($child->localName === 'value') {
                $values[] = $child->textContent;
                continue;
            }

            if ($child->localName === 'desc') {
                $description = $child->textContent;
                continue;
            }

            if ($child->localName === 'required') {
                $required = true;
                continue;
            }

            if ($child->localName === 'option') {
                foreach ($child->childNodes as $optionChild) {
                    if ($optionChild instanceof DOMElement && $optionChild->namespaceURI === XmppXml::DATA_FORM_NS && $optionChild->localName === 'value') {
                        $options[] = [
                            'label' => $child->getAttribute('label') ?: null,
                            'value' => $optionChild->textContent,
                        ];
                    }
                }
            }
        }

        return [
            'var' => $field->getAttribute('var'),
            'type' => $field->getAttribute('type') ?: null,
            'label' => $field->getAttribute('label') ?: null,
            'desc' => $description,
            'required' => $required,
            'values' => $values,
            'options' => $options,
        ];
    }

    /**
     * @return list<string>
     */
    private static function normalizeValues(mixed $values): array
    {
        if ($values === null) {
            return [];
        }

        if (!is_array($values)) {
            return [(string)$values];
        }

        $normalized = [];
        foreach ($values as $value) {
            if ($value !== null) {
                $normalized[] = (string)$value;
            }
        }

        return $normalized;
    }

    /**
     * @return list<array{label:?string,value:string}>
     */
    private static function normalizeOptions(mixed $options): array
    {
        if (!is_array($options)) {
            return [];
        }

        $normalized = [];
        foreach ($options as $key => $option) {
            if (is_array($option)) {
                $value = $option['value'] ?? null;
                if ($value !== null) {
                    $normalized[] = [
                        'label' => isset($option['label']) ? (string)$option['label'] : null,
                        'value' => (string)$value,
                    ];
                }
                continue;
            }

            if ($option !== null) {
                $normalized[] = [
                    'label' => is_string($key) ? $key : null,
                    'value' => (string)$option,
                ];
            }
        }

        return $normalized;
    }
}
