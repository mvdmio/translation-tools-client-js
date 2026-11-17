# Generated placeholder types go on the resource object, not on generated functions

The TranslationTools suite asks every client generator for one named, required argument per placeholder. The .NET client meets that with a generated static method per Key, because .NET looks up translations through a static client.

This client looks up translations through a client instance (`client.get(Translations.greeting, locale, { userName })`). It also uses the generated `Translations` object as data for the bundled fallback. So the generator does not emit a function per Key. Each generated `TranslationStringResource` carries its placeholder names as type parameters, and the `get` overload for a resource requires exactly those names. The required names are the Key's placeholders minus the global placeholders listed in `translationtools.yaml`.

## Considered Options

- A generated function per Key, as in .NET. It needs the client instance passed in or bound at import, which adds a second way to look up a Key and a second generated shape to keep in step with the bundled snapshot.
- Requiring every placeholder, global placeholders included. Every caller would pass values the app already supplies once, and each per-call value would override the global one.
