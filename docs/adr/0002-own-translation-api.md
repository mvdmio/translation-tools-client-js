# Apps call this client as the translation API

JavaScript has several popular translation libraries (i18next, Vue I18n, FormatJS) and no default. The KMP library ships its own lookup API because Kotlin has no default either.

This client is that API for Node.js. It does not generate files for i18next or wrap those libraries.

Feature parity with KMP is the goal. Adapters for other libraries can be a later product.
