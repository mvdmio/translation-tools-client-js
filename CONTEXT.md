# Translation Tools Client (JavaScript)

A Node.js library published to npm that lets a project use TranslationTools. Local resource files are the editable source, TranslationTools is the remote store, and the runtime client serves translations to application code.

## Language

**TranslationTools**:
The remote service that stores and serves translations.
_Avoid_: backend, server, API

**Translation Tools Client**:
The npm package a Node.js project installs to talk to TranslationTools and to look up translations in application code.
_Avoid_: JS client, i18n library, i18next

**Source of truth**:
The local JSON resource files a developer edits. They define keys and locales. TranslationTools mirrors them. One file per locale.
_Avoid_: snapshot, cache, remote store

**JSON resource file**:
A `.json` file of flat keys and string values for one locale. The default-locale file has no locale suffix (`strings.json`). Other locales use `name.{locale}.json` (`strings.nl.json`). Files that share a base name share an origin.
_Avoid_: locale file, i18n file, messages file, catalog

**Translation Tools CLI**:
The dev-only npm package a developer runs with npx to init, pull, push, and generate.
_Avoid_: tool, generator, codegen, translations CLI

**Translation ref**:
The identity of one translation entry: an origin plus a key. Together with a locale, that addresses one value.
_Avoid_: id, resource name

**Origin**:
The identity of a JSON resource file: the npm package name as written in `package.json` (including a scope) plus the project-relative path to the default-locale file (`@org/app:/translations/strings.json`). Same keys in different files or packages stay distinct.
_Avoid_: path, namespace, file, module

**Key**:
The stable id of an entry within an origin.
_Avoid_: name, string name, identifier

**Locale**:
A language, optionally with a region (`en`, `nl`, `pt-br`).
_Avoid_: language, culture, culture info

**Placeholder**:
A named slot in a translation value that the app fills in at lookup, written as a lowercase letter followed by letters and digits, in braces (`{userName}`). A Key's placeholders are the ones its default-locale value contains.
_Avoid_: token, argument, parameter, variable

**Global placeholder**:
A placeholder whose value the app supplies once for every lookup instead of on each call (`{appName}`).
_Avoid_: shared placeholder, default placeholder

**Plural**:
A translation value that is one ICU plural argument wrapping the whole value, with a whole sentence per Plural form (`{count, plural, =0 {No items} one {# item} other {# items}}`). The app passes a whole number under the argument's name, and that number picks the form.
_Avoid_: plural string, ICU message, quantity string

**Plural form**:
One case of a Plural: an exact number (`=0`) or a CLDR plural category (`one`, `few`, `other`), together with the sentence shown for it. A `#` in the sentence prints the number.
_Avoid_: branch, variant, quantity

**Bundled fallback**:
Translations shipped with the app so lookups work before the first refresh and when the network is down.

**Runtime refresh**:
Fetching updated translations from TranslationTools after the app is installed, without a new build.
