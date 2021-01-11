# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

### Localization for the App UI of Profiler

# Naming convention for l10n IDs: "ComponentName--string-summary".
# This allows us to minimize the risk of conflicting IDs throughout the app.
# Please sort alphabetically by (component name).
# keep strings in order of appearance.

## The following feature names must be treated as a brand. They cannot be translated
-brand-name = Firefox
-profiler-brand-name = Firefox Profiler

# Home page translations
AppHeader--app-header-slogan= { -profiler-brand-name }
AppHeader--app-header-subtext = {" "}&mdash; Web app for Firefox performance analysis

FooterLinks--legal = Legal
FooterLinks--Privacy = Privacy
FooterLinks--Cookies = Cookies

Home--special-message = Capture a performance profile. Analyze it. Share it. Make the web faster.
Home--documentation-button = <span className="homeSectionDocsIcon" />Documentation
Home--instructions-title = How to view and record profiles
Home--instructions-content = 
    Recording performance profiles requires <a>Firefox</a>.
    However, existing profiles can be viewed in any modern browser.

Home--additional-content-title = Load existing profiles
Home--additional-content-content = 
    You can <strong>drag and drop</strong> a profile file here to load it, or:
Home--upload-from-file-input-button = Load a profile from file
Home--upload-from-url-button = Load a profile from a URL
Home--compare-recordings-info = You can also compare recordings.{" "}
Home--compare-recordings-info-link = Open the comparing interface.
Home--recent-uploaded-recordings-title = Recent uploaded recordings

ListOfPublishedProfiles--uploaded-profile-information-list-empty = No profile has been uploaded yet!
ListOfPublishedProfiles--uploaded-profile-information-label = 
    { $uploadedProfileInformationListLength ->
        [one] Manage this recording
       *[other] Manage these recordings
    }

profileRootMessage--tittle = { -profiler-brand-name }
profileRootMessage--additional = {" "}Back to home
