# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox i Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Asnas web i { -firefox-brand-name } tesleḍt n tmellit</subheader>
AppHeader--github-icon =
    .title = Ddu ɣer ukufi-nneɣ Git (yettalday deg usafylu amaynut)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Yegguma ad d-ikter n umaɣnu.
AppViewRouter--error-unpublished = Ur yezmir ara ad d-yaf amaɣnu seg { -firefox-brand-name }.
AppViewRouter--error-from-file = Ur izmir ara ad d-iɣer afaylu neɣ ad yesleḍ amaɣnu  yellan deg-s.
AppViewRouter--error-local = Ur yebdid ara yakan.
AppViewRouter--error-public = Ur yezmir ara ad d-yader amaɣnu.
AppViewRouter--error-from-url = Ur yezmir ara ad d-yessader amaɣnu.
AppViewRouter--error-compare = Yegguma ad d-yerr imaɣunen.
AppViewRouter--route-not-found--home =
    .specialMessage = URL wuɣur tettaɛraḍeḍ ad tawḍeḍ ur tettwassen ara.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Sken <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Smezdi tawuri
    .title =
        Asmezdi n twuri itekkes-itt seg umaɣnu, ad tmudd akud-ines i
        twuri i yettusemman yis-s. Aya iḍerru-d deg yal adeg anida i d-tettusiwel twuri deg
        useklu.
CallNodeContextMenu--transform-focus-function = Siḍes ef twuri
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Siḍeṣ ɣef twuri (imitti)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-collapse-function-subtree = Ṭebbeq tawuri
    .title = Aṭebbeq n twuri ad yekkes meṛṛa ayen iwumi tessawaldaɣen ad tefk  akk akud n uselkem i twuri. Aya ad yefk tallelt i usifses n umaɣnu ara yessiwlen i tengalt ur yattwaslaḍen ara.
CallNodeContextMenu--expand-all = Snefli akk
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Nadi isem n twuri ɣef Searchfox
CallNodeContextMenu--copy-function-name = Nɣel isem n tmahalt
CallNodeContextMenu--copy-script-url = Nɣel URL n usekript
CallNodeContextMenu--copy-stack = Nqel tanebdant
CallNodeContextMenu--show-the-function-in-devtools = Sken tawuri deg yifecka n usnefli

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Fren takerrist i uskan n talɣut fell-as.
CallTreeSidebar--call-node-details = Talqayt n tkerrist n usiwel

## CallTreeSidebar timing information
##
## Firefox Profiler stops the execution of the program every 1ms to record the
## stack. Only thing we know for sure is the stack at that point of time when
## the stack is taken. We try to estimate the time spent in each function and
## translate it to a duration. That's why we use the "traced" word here.
## There is actually no difference between "Traced running time" and "Running
## time" in the context of the profiler. We use "Traced" to emphasize that this
## is an estimation where we have more space in the UI.
##
## "Self time" is the time spent in the function itself, excluding the time spent
## in the functions it called. "Running time" is the time spent in the function
## itself, including the time spent in the functions it called.

CallTreeSidebar--categories = Taggayin

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Sekcem URLs n umaɣnu i tebɣiḍ ad tsenmehleḍ
CompareHome--form-label-profile1 = Amaɣnu 1:
CompareHome--form-label-profile2 = Amaɣnu 2:
CompareHome--submit-button =
    .value = Err-d imaɣunen

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Ldi afeggag adisan
Details--close-sidebar-button =
    .title = Mdel agalis adisan

## Footer Links

FooterLinks--legal = Usḍif
FooterLinks--Privacy = Tabaḍnit
FooterLinks--Cookies = Inagan n tuqqna
FooterLinks--languageSwitcher--select =
    .title = Snifel tutlayt
FooterLinks--hide-button =
    .title = Ffer iseɣwan n uḍar n usebter
    .aria-label = Ffer iseɣwan n uḍar n usebter

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> tizlatin

## Home page

Home--upload-from-file-input-button = Sali-d amaɣnu seg ufaylu
Home--upload-from-url-button = Sali-d amaɣnu seg URL
Home--load-from-url-submit-button =
    .value = Sali
Home--documentation-button = Tasemlit
Home--menu-button = Rmed taqeffalt n wumuɣ { -profiler-brand-name }
Home--record-instructions-start-stop = Seḥbes neɣ bdu timeɣna
Home--record-instructions-capture-load = Ṭṭef neɣ sali amaɣnu
Home--profiler-motto = Ṭṭef amaɣnu n temlellit. Sleḍ-it. Bḍu-t. Err web d arurad.
Home--additional-content-title = Sali imuɣna yellan
Home--additional-content-content = Tzemreḍ <strong>ad tzuɣreḍ syen sers</strong> afaylu n umaɣnu da i usali-ines, neɣ:
Home--compare-recordings-info = Tzemreḍ daɣen ad tsenmehleḍ iseklasen. <a>Ldi agrudem n usnemhel.</a>
Home--your-recent-uploaded-recordings-title = Iseklasen-ik·im i d-yulin melmi kan
Home--install-chrome-extension = Sbedd aseɣẓan  n Chrome

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Sekcem awalen n yimsizdeg

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Sit da i wakken ad d-yali umaɣnu { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Kkes
    .title = Amaɣnu-a ur yezmir ara ad yettwakkes acku ur nesɛi ara talɣut n usireg.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Ulac ameɣnu i d-yettwasulin akka ar tura!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Wali syen sefrek meṛṛa iseklasen-ik·im ({ $profilesRestCount } d wugar)
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Sefrek asekles-a
       *[other] Sefrek iseklasen-a
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--start-selection-here = Bdu afran sa
MarkerContextMenu--end-selection-here = Taggara n ufran da
MarkerContextMenu--copy-description = Nɣel aglam
MarkerContextMenu--copy-call-stack = Nɣel tanebdant n usiwel
MarkerContextMenu--copy-url = Nɣel URL
MarkerContextMenu--copy-page-url = Nɣel URL n usebter
MarkerContextMenu--copy-as-json = Nɣel am JSON

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Bdu
MarkerTable--duration = Tangazt
MarkerTable--name = Isem
MarkerTable--details = Aglam leqqayen

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Talɣut n umaɣnu
MenuButtons--index--full-view = Askan aččuran
MenuButtons--index--cancel-upload = Sefsex asali
MenuButtons--index--share-upload =
    .label = Sali amaɣnu adigan
MenuButtons--index--share-re-upload =
    .label = Ales asali
MenuButtons--index--share-error-uploading =
    .label = Tuccḍa deg usali
MenuButtons--index--revert = Uɣal ɣer umaɣnu aɣbalu
MenuButtons--index--docs = Tasemlit
MenuButtons--permalink--button =
    .label = Permalink

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Yuli-d:
MenuButtons--index--profile-info-uploaded-actions = Kkes
MenuButtons--index--metaInfo-subtitle = Talɣut n umaɣnu
MenuButtons--metaInfo--symbols = Izamulen:
MenuButtons--metaInfo--main-memory = Takatut tagejdant:
MenuButtons--index--show-moreInfo-button = Sken ugar
MenuButtons--index--hide-moreInfo-button = Sken drus
MenuButtons--metaInfo--profiling-started = Asekles yebda:
MenuButtons--metaInfo--main-process-started = Asesfer agejdan yebda:
MenuButtons--metaInfo--main-process-ended = Asesfer agejdan yekfa:
MenuButtons--metaInfo--interval = Azilal:
MenuButtons--metaInfo--buffer-capacity = Tazmert n uḥraz:
MenuButtons--metaInfo--buffer-duration = Tanzgat n uḥraz:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } n tesdat
       *[other] { $configurationDuration } n tesdatin
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = War talast
MenuButtons--metaInfo--application = Asnas
MenuButtons--metaInfo--name-and-version = Isem akked lqem:
MenuButtons--metaInfo--update-channel = Leqqem abadu:
MenuButtons--metaInfo--build-id = Asulay n lebni:
MenuButtons--metaInfo--build-type = Anaw n lebni:
MenuButtons--metaInfo--arguments = Ifakulen:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Tamseɣtayt
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Tiɣerɣert
MenuButtons--metaInfo--device = Ibenk:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = Anagraw n wammud:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--speed-index = Amatar arurad:
MenuButtons--metaInfo-renderRowOfList-label-features = Timahilin:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Imsizdeg n usqerdec:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Isiɣzaf:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-mean = Agejdan
MenuButtons--metaOverheadStatistics-max = Afellay
MenuButtons--metaOverheadStatistics-min = Tis
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Asfaḍ
    .title = Akud i tukksa n yisefka ifaten.
MenuButtons--metaOverheadStatistics-statkeys-counter = Amessuḍan
    .title = Akud i usegrew n meṛṛa imessuḍanen.
MenuButtons--metaOverheadStatistics-statkeys-interval = Azilal
    .title = Iban-d uzilal gar sin yimedyaten

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-include-other-tabs = Seddu isefka seg waccaren-nniḍen
MenuButtons--publish--renderCheckbox-label-include-screenshots = Seddu inegzumen
MenuButtons--publish--renderCheckbox-label-resource = Seddu URLs d yiberdan n tiɣbula
MenuButtons--publish--renderCheckbox-label-extension = Seddu talɣut n usiɣzef
MenuButtons--publish--renderCheckbox-label-preference = Seddu azalen n usmenyif
MenuButtons--publish--renderCheckbox-label-private-browsing = Seddu isefka seg yisfuyla n tunigin tusligt
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Amaɣnu-a yegber isefka n tunigin tusligt
MenuButtons--publish--reupload-performance-profile = Ales asali n umaɣnu n temlellit
MenuButtons--publish--share-performance-profile = Bḍu amaɣnu n usmenyif
MenuButtons--publish--info-description-default = S wudem amezwer, isefka-ik·im udmawanen ttwakksen.
MenuButtons--publish--button-upload = Sali
MenuButtons--publish--upload-title = Asali n umaɣnu…
MenuButtons--publish--cancel-upload = Sefsex asali
MenuButtons--publish--message-try-again = Ɛreḍ tikelt-nniḍen
MenuButtons--publish--download = Sader
MenuButtons--publish--compressing = Tussda…

## Timestamp formatting primitive

# This displays a date in a shorter rendering, depending on the proximity of the
# date from the current date. You can look in src/utils/l10n-ftl-functions.js
# for more information.
# This is especially used in the list of published profiles panel.
# There shouldn't need to change this in translations, but having it makes the
# date pass through Fluent to be properly localized.
# The function SHORTDATE is specific to the profiler. It changes the rendering
# depending on the proximity of the date from the current date.
# Variables:
#   $date (Date) - The date to display in a shorter way
NumberFormat--short-date = { SHORTDATE($date) }

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Ẓreg isem n umaɣnu

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Kkes
    .title = Sit dagi i tukksa n umaɣnu { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Tella-d tuccḍa lawan n tukksa n umaɣna-a <a>Ɛeddi ɣef useɣwen-a i wakken ad teẓreḍ ugar</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Kkes { $profileName }
ProfileDeletePanel--dialog-cancel-button =
    .value = Sefsex
ProfileDeletePanel--dialog-delete-button =
    .value = Kkes
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Tukksa…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Isefka i d-yulin ttwakksen akken iwata

## Profile Loader Animation

ProfileLoaderAnimation--loading-unpublished = Aktar n umaɣnu srid seg { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Taɣuri n ufaylu d usesfer n umaɣnu…
ProfileLoaderAnimation--loading-local = Ur yettwasebded ara yakan.
ProfileLoaderAnimation--loading-public = Asader d usesfer n umaɣnu…
ProfileLoaderAnimation--loading-from-url = Asader d usesfer n umaɣnu…
ProfileLoaderAnimation--loading-compare = Taquri d usesfer n yimuɣna…
ProfileLoaderAnimation--loading-view-not-found = Ur tettwaf ara teskant

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Uɣal ɣer ugejdan

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Asnas iteddu…
ServiceWorkerManager--pending-button = Snes syen ales asali
ServiceWorkerManager--installed-button = Ales asali n usnas
ServiceWorkerManager--new-version-is-ready = Lqem amaynut n usnas yettwasader, yewjed i useqqdec
ServiceWorkerManager--hide-notice-button =
    .title = Ffer alɣu-a d-yulin i tikkelt-nniḍen
    .aria-label = Ffer alɣu-a d-yulin i tikkelt-nniḍen

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--use-data-source-label = Aɣbalu n yisefka:
StackSettings--show-user-timing = Sken tanzagt n useqdac

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Aseklu n usiwel
TabBar--network-tab = Aẓeṭṭa

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Sken kan asesfer-a
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Sken kan “{ $trackName }”
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Ffer “{ $trackName }”
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Ulac igmaḍ yettwafen i “<span>{ $searchFilter }</span>”
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Ffer asesfer

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = takatut tamassaɣt deg wakud-a

## TrackPower
## This is used to show the power used by the CPU and other chips in a computer,
## graphed over time.
## It's not always displayed in the UI, but an example can be found at
## https://share.firefox.dev/3a1fiT7.
## For the strings in this group, the carbon dioxide equivalent is computed from
## the used energy, using the carbon dioxide equivalent for electricity
## consumption. The carbon dioxide equivalent represents the equivalent amount
## of CO₂ to achieve the same level of global warming potential.

# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Power

## TransformNavigator
## Navigator for the applied transforms in the Call Tree, Flame Graph, and Stack
## Chart components.
## These messages are displayed above the table / graph once the user selects to
## apply a specific transformation function to a node in the call tree. It's the
## name of the function, followed by the node's name.
## To learn more about them, visit:
## https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=transforms

# Root item in the transform navigator.
# "Complete" is an adjective here, not a verb.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the current thread. E.g.: Web Content.
TransformNavigator--complete = Ččar “{ $item }”
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Fneẓ: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Afukus: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Smezdi tikerrist: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Smezdi: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Sers: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Fneẓ asniles: { $item }

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Yettragu { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Yettraǧu { -firefox-brand-name }…
SourceView--close-button =
    .title = Mdel timeẓri taneṣlit

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Ur yezmir ara ad yessuter i API n uzamul n yiminig: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = API n uzamul n yiminig yerra-d tuccḍa: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Afaylu { $pathInArchive } ur yettwaf ara deg teṛcivt n { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Aḥraz deg { $url } ur yezmir ara ad yettwasleḍ: { $parsingErrorMessage }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Iseklasen i d-yettwasulin
