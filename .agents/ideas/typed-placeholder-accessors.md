# Typed placeholder accessors

## Motivation

KMP generates typed keys but not typed placeholder arguments. Apps pass a free-form map. The TranslationTools suite already named typed accessors as follow-up work for KMP and JS generators.

## Goal

When a key’s value contains `{userName}`, generate a function (or typed argument object) that requires `userName` instead of a free-form map.

## Decisions (locked)

Out of the first JavaScript client version. That version matches KMP as it ships today: typed keys, untyped placeholder maps.

## Out of scope

Changing the KMP generator. Changing placeholder token syntax.

## Open questions

Whether JS should land this before KMP, or both together.
