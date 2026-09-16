# Publish only from GitHub Actions with trusted publishing

The .NET and KMP Translation Tools clients publish with a long-lived registry API key stored in GitHub secrets. npm tokens in secrets get stolen. npm now lets GitHub Actions prove its identity, so CI can publish with no token.

This client publishes to npm only from GitHub Actions, on a version tag, using trusted publishing. Maintainers do not publish from a laptop. GitHub secrets do not hold an npm token.

That path differs from the sibling clients on purpose. It is how npm wants public packages published, and it matches publish-on-tag.
