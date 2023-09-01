# Locales

## Note to contributors

Please change only the locale content in the `en-US`
directory. The other directories are changed using [Pontoon](https://pontoon.mozilla.org/projects/firefox-profiler/).

Here are the most important rules:

1. If you change the string in a way that changes the meaning, you need to
   change the string key as well. If that doesn't change the meaning (for
   example, if that's a typo fix), then the string key can stay the same. You
   can read [the dedicated documentation](https://mozilla-l10n.github.io/documentation/localization/making_string_changes.html)
   if you want to know more.
2. If you include a variable, make sure to add a comment explaining it.
3. If the context for a string isn't clear (for example, this is a short string
   whose content doesn't give an indication about where it's used), please add a
   comment explaining it too. You can read [the dedicated documentation](https://mozilla-l10n.github.io/documentation/localization/dev_best_practices.html#add-localization-notes)
   to see more examples of when a comment is necessary.

[The page about localization best practices for web developers](https://mozilla-l10n.github.io/documentation/localization/dev_best_practices.html)
gives a lot of good guidance to write excellent strings.

## Note to translators

Please use [Pontoon](https://pontoon.mozilla.org/projects/firefox-profiler/) to update languages other than `en-US`.
If a pull request updates those, we'll ask you to revert these changes.
