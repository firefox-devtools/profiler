# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

### Localization for the App UI of Profiler

# Naming convention for l10n IDs: "ComponentName--string-summary".
# This allows us to minimize the risk of conflicting IDs throughout the app.
# Please sort alphabetically by (component name), and
# keep strings in order of appearance.

## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-profiler-brand-name = Firefox Profiler

## AppHeader

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Web app for { -firefox-brand-name } performance analysis</subheader>
AppHeader--github-icon =
    .title = Go to our git repository (this opens in a new window)

## CompareHome

CompareHome--instruction-title = Enter the profile URLs that you’d like to compare
CompareHome--instruction-content =
    The tool will extract the data from the selected track and range for
    each profile, and put them both on the same view to make them easy to
    compare.

CompareHome--form-label-profile1 = Profile 1:
CompareHome--form-label-profile2 = Profile 2:
CompareHome--submit-button =
    .value = Retrieve profiles

## FooterLinks

FooterLinks--legal = Legal
FooterLinks--Privacy = Privacy
FooterLinks--Cookies = Cookies

## Home

Home--upload-from-file-input-button = Load a profile from file
Home--upload-from-url-button = Load a profile from a URL
Home--load-from-url-submit-button =
    .value = Load

Home--documentation-button = Documentation
Home--menu-button = Enable { -profiler-brand-name } Menu Button
Home--menu-button-instructions =
    Enable the profiler menu button to start recording a performance
    profile in { -firefox-brand-name }, then analyze it and share it with profiler.firefox.com.

Home--addon-button = Install add-on
Home--addon-button-instructions =
    Install the Gecko Profiler Add-on to start recording a performance
    profile in { -firefox-brand-name }, then analyze it and share it with profiler.firefox.com.

Home--record-instructions =
    To start profiling, click on the profiling button, or use the
    keyboard shortcuts. The icon is blue when a profile is recording.
    Hit <kbd>Capture Profile</kbd> to load the data into profiler.firefox.com.

Home--instructions-title = How to view and record profiles
Home--instructions-content =
    Recording performance profiles requires <a>{ -firefox-brand-name }</a>.
    However, existing profiles can be viewed in any modern browser.

Home--record-instructions-start-stop = Stop and start profiling
Home--record-instructions-capture-load = Capture and load profile
Home--profiler-motto = Capture a performance profile. Analyze it. Share it. Make the web faster.
Home--additional-content-title = Load existing profiles
Home--additional-content-content = You can <strong>drag and drop</strong> a profile file here to load it, or:
Home--compare-recordings-info = You can also compare recordings. <a>Open the comparing interface.</a>
Home--recent-uploaded-recordings-title = Recent uploaded recordings

## ListOfPublishedProfiles

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Click here to load profile { $smallProfileName }

ListOfPublishedProfiles--published-profiles-delete-button = Delete
    .title = This profile cannot be deleted because we lack the authorization information.

ListOfPublishedProfiles--uploaded-profile-information-list-empty = No profile has been uploaded yet!

# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = See and manage all your recordings ({ $profilesRestCount } more)

# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Manage this recording
       *[other] Manage these recordings
    }

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Back to home

## UploadedRecordingsHome

UploadedRecordingsHome--title = Uploaded Recordings
