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
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Web app for { -firefox-brand-name } performance analysis</subheader>
AppHeader--github-icon =
    .title = Go to our git repository (this opens in a new window)

## AppViewRouter

AppViewRouter--error-message-unpublished =
    .message = Couldn’t retrieve the profile from { -firefox-brand-name }.

AppViewRouter--error-message-from-file =
    .message = Couldn’t read the file or parse the profile in it.

AppViewRouter--error-message-local =
    .message = Not implemented yet.

AppViewRouter--error-message-public =
    .message = Could not download the profile.

AppViewRouter--error-message-from-url =
    .message = Could not download the profile.

AppViewRouter--route-not-found--home =
    .specialMessage = The URL you tried to reach was not recognized.

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

ListOfPublishedProfiles--published-profiles-delete-button-disabled = Delete
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

## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button-uploaded-profile =
    .label = Uploaded Profile

MenuButtons--index--metaInfo-button-local-profile =
    .label = Local Profile

MenuButtons--index--full-view = Full View
MenuButtons--index--cancel-upload = Cancel Upload
MenuButtons--index--share-upload =
    .label = Upload

MenuButtons--index--share-re-upload =
    .label = Re-upload

MenuButtons--index--share-error-uploading =
    .label = Error uploading

MenuButtons--index--revert = Revert to Original Profile
MenuButtons--index--docs = Docs

MenuButtons--permalink--button =
    .label = Permalink

## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Uploaded:
MenuButtons--index--profile-info-uploaded-actions = Delete
MenuButtons--index--metaInfo-subtitle = Profile Information
MenuButtons--metaInfo--symbols = Symbols:
MenuButtons--metaInfo--profile-symbolicated = Profile is symbolicated
MenuButtons--metaInfo--profile-not-symbolicated = Profile is not symbolicated
MenuButtons--metaInfo--resymbolicate-profile = Re-symbolicate profile
MenuButtons--metaInfo--symbolicate-profile = Symbolicate profile
MenuButtons--metaInfo--attempting-resymbolicate = Attempting to re-symbolicate profile
MenuButtons--metaInfo--currently-symbolicating = Currently symbolicating profile
MenuButtons--metaInfo--cpu = CPU:

# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } physical core
       *[other] { $physicalCPUs } physical cores
    }, { $logicalCPUs ->
        [one] { $logicalCPUs } logical core
       *[other] { $logicalCPUs } logical cores
    }

# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } physical core
       *[other] { $physicalCPUs } physical cores
    }

# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } logical core
       *[other] { $logicalCPUs } logical cores
    }

MenuButtons--metaInfo--recording-started = Recording started:
MenuButtons--metaInfo--interval = Interval:
MenuButtons--metaInfo--profile-version = Profile Version:
MenuButtons--metaInfo--buffer-capacity = Buffer Capacity:
MenuButtons--metaInfo--buffer-duration = Buffer Duration:

# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } second
       *[other] { $configurationDuration } seconds
    }

MenuButtons--metaInfo--buffer-duration-unlimited = Unlimited
MenuButtons--metaInfo--application = Application
MenuButtons--metaInfo--name-and-version = Name and version:
MenuButtons--metaInfo--update-channel = Update Channel:
MenuButtons--metaInfo--build-id = Build ID:
MenuButtons--metaInfo--build-type = Build Type:
MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt
MenuButtons--metaInfo--platform = Platform
MenuButtons--metaInfo--device = Device:

# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = OS:

# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Visual Metrics
MenuButtons--metaInfo--speed-index = Speed Index:
MenuButtons--metaInfo--perceptual-speed-index = Perceptual Speed Index:
MenuButtons--metaInfo--contentful-speed-Index = Contentful Speed Index:
MenuButtons--metaInfo-renderRowOfList-label-features = Features:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Threads Filter:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Extensions:

MenuButtons--metaOverheadStatistics-subtitle = Profiler Overhead
MenuButtons--metaOverheadStatistics-mean = Mean
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Overhead
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Cleaning
MenuButtons--metaOverheadStatistics-statkeys-counter = Counter
MenuButtons--metaOverheadStatistics-statkeys-interval = Interval
MenuButtons--metaOverheadStatistics-statkeys-lockings = Lockings
MenuButtons--metaOverheadStatistics-overhead-duration = Overhead Durations:
MenuButtons--metaOverheadStatistics-overhead-percentage = Overhead Percentage:
MenuButtons--metaOverheadStatistics-profiled-duration = Profiled Duration:

## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Include hidden threads
MenuButtons--publish--renderCheckbox-label-hidden-time = Include hidden time range
MenuButtons--publish--renderCheckbox-label-include-screenshots = Include screenshots
MenuButtons--publish--renderCheckbox-label-resource = Include resource URLs and paths
MenuButtons--publish--renderCheckbox-label-extension = Include extension information
MenuButtons--publish--renderCheckbox-label-preference = Include preference values
MenuButtons--publish--reupload-performance-profile = Re-upload Performance Profile
MenuButtons--publish--share-performance-profile = Share Performance Profile
MenuButtons--publish--info-description = Upload your profile and make it accessible to anyone with the link.
MenuButtons--publish--info-description-default = By default, your personal data is removed.
MenuButtons--publish--info-description-firefox-nightly = This profile is from { -firefox-nightly-brand-name }, so by default all information is included.
MenuButtons--publish--include-additional-data = Include additional data that may be identifiable
MenuButtons--publish--button-upload = Upload
MenuButtons--publish--upload-title = Uploading profile…
MenuButtons--publish--cancel-upload = Cancel Upload
MenuButtons--publish--message-something-went-wrong = Uh oh, something went wrong when uploading the profile.
MenuButtons--publish--message-try-again = Try again
MenuButtons--publish--download = Download
MenuButtons--publish--compressing = Compressing…

## ProfileDeleteButton

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Delete
    .title = Click here to delete the profile { $smallProfileName }

## ProfileFilterNavigator

ProfileFilterNavigator--full-range = Full Range

## ProfileLoaderAnimation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = Importing the profile directly from { -firefox-brand-name }…

ProfileLoaderAnimation--loading-message-from-file =
    .message = Reading the file and processing the profile…

ProfileLoaderAnimation--loading-message-local =
    .message = Not implemented yet.

ProfileLoaderAnimation--loading-message-public =
    .message = Downloading and processing the profile…

ProfileLoaderAnimation--loading-message-from-url =
    .message = Downloading and processing the profile…

ProfileLoaderAnimation--loading-message-compare =
    .message = Reading and processing profiles…

ProfileLoaderAnimation--loading-message-view-not-found =
    .message = View not found

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Back to home

## UploadedRecordingsHome

UploadedRecordingsHome--title = Uploaded Recordings
