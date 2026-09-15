# Origin includes the npm package name

An origin is the identity TranslationTools stores with every key. The KMP client builds origins from Gradle path plus filename (`:/strings.xml`, `:app:/strings.xml`) and omits a stable package identity. Two projects can then share an origin.

This client uses `{package.json name}:/{path to the default-locale JSON resource file}`, including an npm scope (`@org/app:/translations/strings.json`). The name is the one next to `translationtools.yaml`. A name that contains `:` is rejected.

Path-only origins collide when more than one Node package sits in one TranslationTools project. Including the package name matches the .NET client’s `<project>:<path>` shape and is the correct identity. The KMP omission is a mistake we do not copy. Renaming the npm package changes origins. The TranslationTools API stores origin lowercase and accepts this string; HTTP calls encode origin as one URL path segment.
