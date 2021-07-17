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
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Asnas web i { -firefox-brand-name } tesleḍt n tmellit</subheader>
AppHeader--github-icon =
    .title = Ddu ɣer ukufi-nneɣ Git (yettalday deg usafylu amaynut)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = Ur yezmir ara ad d-yerr amaɣnu seg { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = Taɣuri n faylu neɣ tasleḍt n ufylu yellan deg-s d awezɣi.
AppViewRouter--error-message-local =
    .message = Ur yettwasebded ara yakan.
AppViewRouter--error-message-public =
    .message = Ur yezmir ara ad d-yader umaɣnu.
AppViewRouter--error-message-from-url =
    .message = Ur yezmir ara ad d-yader umaɣnu.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--expand-all = Snefli akk
CallNodeContextMenu--copy-function-name = Nɣel isem n tmahalt
CallNodeContextMenu--copy-script-url = Nɣel URL n usekript
CallNodeContextMenu--copy-stack = Nqel tanebdant

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--form-label-profile1 = Amaɣnu 1:
CompareHome--form-label-profile2 = Amaɣnu 2:

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--close-sidebar-button =
    .title = Mdel agalis adisan

## Footer Links

FooterLinks--legal = Usḍif
FooterLinks--Privacy = Tabaḍnit
FooterLinks--Cookies = Inagan n tuqqna

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Anaw n udfil:
FullTimeline--categories-with-cpu = taggayin s CPU
FullTimeline--categories = Taggayin
FullTimeline--stack-height = Teɣzi n tbursa

## Home page

Home--upload-from-file-input-button = Sali-d amaɣnu seg ufaylu
Home--upload-from-url-button = Sali-d amaɣnu seg URL
Home--load-from-url-submit-button =
    .value = Sali
Home--documentation-button = Tasemlit
Home--menu-button = Rmed taqeffalt n wumuɣ { -profiler-brand-name }
Home--addon-button = Sebded azegrir
Home--instructions-title = Amek ara twaliḍ akked ad teskelseḍ imuɣna
Home--record-instructions-start-stop = Seḥbes neɣ bdu timeɣna
Home--record-instructions-capture-load = Ṭṭef neɣ sali amaɣnu
Home--profiler-motto = Ṭṭef amaɣnu n temlellit. Sleḍ-it. Bḍu-t. Err web d arurad.
Home--additional-content-title = Sali imuɣna yellan
Home--additional-content-content = Tzemreḍ <strong>ad tzuɣreḍ syen sers</strong> afaylu n umaɣnu da i usali-ines, neɣ:
Home--compare-recordings-info = Tzemreḍ daɣen ad tsenmehleḍ iseklasen. <a>Ldi agrudem n usnemhel.</a>
Home--recent-uploaded-recordings-title = Iseklasen i d-ulin melmi kan

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Sekcem awalen n yimsizdeg

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

ListOfPublishedProfiles--published-profiles-delete-button-disabled = Kkes
    .title = Amaɣnu-a ur yezmir ara ad yettwakkes acku ur nesɛi ara talɣut n usireg.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Ulac ameɣnu i d-yettwasulin akka ar tura!
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
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
MarkerContextMenu--copy-full-payload = Nɣel tuttra tummidt

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Bdu
MarkerTable--duration = Tangazt
MarkerTable--type = Anaw
MarkerTable--description = Aglam

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
MenuButtons--metaInfo--cpu = CPU:
MenuButtons--metaInfo--recording-started = Asekles yebda:
MenuButtons--metaInfo--interval = Azilal:
MenuButtons--metaInfo--profile-version = Lqem n umaɣnu:
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
MenuButtons--metaInfo-renderRowOfList-label-extensions = Isiɣzaf:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-min = Tis

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-include-screenshots = Seddu inegzumen
MenuButtons--publish--renderCheckbox-label-extension = Seddu talɣut n usiɣzef
MenuButtons--publish--renderCheckbox-label-preference = Seddu azalen n usmenyif
MenuButtons--publish--share-performance-profile = Bḍu amaɣnu n usmenyif
MenuButtons--publish--info-description-default = S wudem amezwer, isefka-ik·im udmawanen ttwakksen.
MenuButtons--publish--button-upload = Sali
MenuButtons--publish--upload-title = Asali n umaɣnu…
MenuButtons--publish--cancel-upload = Sefsex asali
MenuButtons--publish--message-try-again = Ɛreḍ tikelt-nniḍen
MenuButtons--publish--download = Sader
MenuButtons--publish--compressing = Tussda…

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Azilal ummid

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-local =
    .message = Ur yettwasebded ara yakan.

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.


## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.


## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Aseklu n usiwel
TabBar--network-tab = Aẓeṭṭa

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.


## TransformNavigator
## Navigator for the applied transforms in the Call Tree, Flame Graph, and Stack
## Chart components.
## These messages are displayed above the table / graph once the user selects to
## apply a specific transformation function to a node in the call tree. It's the
## name of the function, followed by the node's name.
## To learn more about them, visit:
## https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=transforms


## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

