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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Вэб-праграма для аналізу прадукцыйнасці { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Перайдзіце да нашага Git рэпазіторыя (адкрыецца ў новым акне)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-unpublished = Не ўдалося атрымаць профіль з { -firefox-brand-name }.
AppViewRouter--error-from-file = Не ўдалося прачытаць файл або разабраць профіль у ім.
AppViewRouter--error-local = Яшчэ не рэалізавана.
AppViewRouter--error-public = Не атрымалася спампаваць профіль.
AppViewRouter--error-from-url = Не атрымалася спампаваць профіль.
AppViewRouter--error-compare = Не ўдалося атрымаць профілі.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    Праз <a>абмежаванні ў Safari</a> { -profiler-brand-name } не можа
    імпартаваць профілі з лакальнай машыны ў гэты браўзер. Замест гэтага
    адкройце гэту старонку ў { -firefox-brand-name } або Chrome.
    .title = Safari не можа імпартаваць лакальныя профілі
AppViewRouter--route-not-found--home =
    .specialMessage = URL-адрас, да якога вы намагаецеся атрымаць доступ, не распазнаны.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = Аб'яднаць функцыю
    .title =
        Аб'яднанне функцыі выдаляе яе з профілю і прызначае яе час
        функцыі, якая яе выклікала. Гэта адбываецца ўсюды, дзе функцыя была
        выклікана ў дрэве.
CallNodeContextMenu--expand-all = Разгарнуць усё
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Шукаць назву функцыі у Searchfox
CallNodeContextMenu--copy-function-name = Капіяваць назву функцыі
CallNodeContextMenu--copy-script-url = Капіяваць URL-адрас скрыпту
CallNodeContextMenu--copy-stack = Капіяваць стэк

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Час працы (мс)
    .title =
        «Агульны» час працы ўключае суму ўсяго часу,
        на працягу якога гэта функцыя знаходзілася ў стэку. Сюды ўваходзіць час,
        на працягу якога функцыя фактычна выконвалася, а таксама час выканання
        функцый, якія вызвала гэта функцыі.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--form-label-profile1 = Профіль 1:
CompareHome--form-label-profile2 = Профіль 2:
CompareHome--submit-button =
    .value = Атрымаць профілі

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Адкрыць бакавую панэль
Details--close-sidebar-button =
    .title = Закрыць бакавую панэль
Details--error-boundary-message =
    .message = Ой, на гэтай панэлі адбылася невядомая памылка.

## Footer Links

FooterLinks--legal = Прававыя звесткі
FooterLinks--Privacy = Прыватнасць
FooterLinks--Cookies = Кукі
FooterLinks--languageSwitcher--select =
    .title = Змяніць мову
FooterLinks--hide-button =
    .title = Схаваць спасылкі ў ніжнім калонтытуле
    .aria-label = Схаваць спасылкі ў ніжнім калонтытуле

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.


## Home page

Home--upload-from-file-input-button = Загрузіць профіль з файла
Home--upload-from-url-button = Загрузіце профіль з URL
Home--load-from-url-submit-button =
    .value = Загрузіць
Home--documentation-button = Дакументацыя
Home--menu-button = Уключыць кнопку меню { -profiler-brand-name }
Home--menu-button-instructions =
    Уключыце кнопку меню прафайлера, каб пачаць запіс профілю прадукцыйнасці
    у { -firefox-brand-name }, затым прааналізуйце яго і падзяліцеся з profiler.firefox.com.
Home--instructions-title = Як праглядаць і запісваць профілі
Home--instructions-content =
    Для запісу профіляў прадукцыйнасці патрабуецца <a>{ -firefox-brand-name }</a>.
    Аднак існуючыя профілі можна праглядаць у любым сучасным браўзеры.
Home--record-instructions-start-stop = Спыніцца і пачаць прафіляванне
Home--record-instructions-capture-load = Захапіць і загрузіць профіль
Home--profiler-motto = Захапіце профіль прадукцыйнасці. Прааналізуйце яго. Падзяліцеся ім. Зрабіце Інтэрнэт хутчэйшым.
Home--additional-content-title = Загрузіць існуючыя профілі
Home--additional-content-content = Вы можаце <strong>перацягнуць</strong> файл профілю сюды, каб загрузіць яго, або:
Home--compare-recordings-info = Вы таксама можаце параўнаць запісы. <a>Адкрыць інтэрфейс параўнання.</a>
Home--your-recent-uploaded-recordings-title = Вашы нядаўна запампаваныя запісы

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Увядзіце ўмовы фільтру

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Паказваць толькі ўласны час
    .title = Паказваць толькі час, праведзены ў вузле выкліку, ігнаруючы даччыныя элементы.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Націсніце тут, каб загрузіць профіль { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Выдаліць
    .title = Гэты профіль не можа быць выдалены, таму што мы не маем інфармацыі пра аўтарызацыю.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Ніводнага профілю яшчэ не запампавана!

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--start-selection-here = Пачаць вылучэнне тут
MarkerContextMenu--end-selection-here = Скончыць вылучэнне тут
MarkerContextMenu--start-selection-at-marker-start = Пачаць вылучэнне ад <strong>пачатку</strong> маркера
MarkerContextMenu--start-selection-at-marker-end = Пачаць вылучэнне ад <strong>канца</strong> маркера
MarkerContextMenu--end-selection-at-marker-start = Скончыць вылучэнне на <strong>пачатку</strong> маркера
MarkerContextMenu--end-selection-at-marker-end = Скончыць вылучэнне ў <strong>канцы</strong> маркера
MarkerContextMenu--copy-description = Капіяваць апісанне
MarkerContextMenu--copy-call-stack = Капіяваць стэк выклікаў
MarkerContextMenu--copy-url = Капіяваць URL
MarkerContextMenu--copy-page-url = Капіяваць URL-адрас старонкі
MarkerContextMenu--copy-as-json = Капіяваць як JSON

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Пачатак
MarkerTable--duration = Працягласць
MarkerTable--type = Тып
MarkerTable--description = Апісанне

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Даныя профілю
MenuButtons--index--full-view = Поўны прагляд
MenuButtons--index--cancel-upload = Скасаваць запампоўку
MenuButtons--index--share-upload =
    .label = Запампаваць лакальны профіль
MenuButtons--index--share-re-upload =
    .label = Паўторная запампаваць
MenuButtons--index--share-error-uploading =
    .label = Памылка запампоўкі
MenuButtons--index--revert = Вярнуцца да зыходнага профілю
MenuButtons--index--docs = Дакументы

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Запампавана:
MenuButtons--index--profile-info-uploaded-actions = Выдаліць
MenuButtons--index--metaInfo-subtitle = Інфармацыя аб профілі
MenuButtons--metaInfo--symbols = Сімвалы:
MenuButtons--metaInfo--cpu-model = Мадэль ЦП:
MenuButtons--metaInfo--cpu-cores = Ядра ЦП:
MenuButtons--metaInfo--main-memory = Асноўная памяць:
MenuButtons--index--show-moreInfo-button = Паказаць больш
MenuButtons--index--hide-moreInfo-button = Паказаць менш
MenuButtons--metaInfo--interval = Інтэрвал:
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Неабмежавана
MenuButtons--metaInfo--application = Праграма
MenuButtons--metaInfo--name-and-version = Назва і версія:
MenuButtons--metaInfo--arguments = Аргументы:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Платформа
MenuButtons--metaInfo--device = Прылада:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = АС:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo-renderRowOfList-label-features = Магчымасці:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Пашырэнні:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-max = Макс
MenuButtons--metaOverheadStatistics-min = Мін

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--reupload-performance-profile = Паўторна запампаваць профіль прадукцыйнасці
MenuButtons--publish--share-performance-profile = Абагуліць профіль прадукцыйнасці
MenuButtons--publish--button-upload = Запампаваць
MenuButtons--publish--upload-title = Запампоўванне профілю…
MenuButtons--publish--cancel-upload = Скасаваць запампоўку
MenuButtons--publish--message-try-again = Паспрабаваць зноў
MenuButtons--publish--download = Спампаваць
MenuButtons--publish--compressing = Сцісканне...

## NetworkSettings
## This is used in the network chart.


## Timestamp formatting primitive


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

ProfileDeletePanel--dialog-cancel-button =
    .value = Скасаваць
ProfileDeletePanel--dialog-delete-button =
    .value = Выдаліць
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Выдаленне…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Запампаваныя даныя былі паспяхова выдалены.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.


## Profile Loader Animation


## ProfileRootMessage


## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.


## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-javascript = JavaScript

## Tab Bar for the bottom half of the analysis UI.


## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.


## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track


## TrackPower
## This is used to show the power used by the CPU and other chips in a computer,
## graphed over time.
## It's not displayed by default in the UI, but an example can be found at
## https://share.firefox.dev/3a1fiT7.


## TrackSearchField
## The component that is used for the search input in the track context menu.


## TransformNavigator
## Navigator for the applied transforms in the Call Tree, Flame Graph, and Stack
## Chart components.
## These messages are displayed above the table / graph once the user selects to
## apply a specific transformation function to a node in the call tree. It's the
## name of the function, followed by the node's name.
## To learn more about them, visit:
## https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=transforms


## Source code view in a box at the bottom of the UI.

# Displayed whenever the source view was not able to get the source code for
# a file.
SourceView--source-not-available-title = Зыходны код недаступны
# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Для гэтага файла няма вядомага cross-origin-accessible URL-адраса.
SourceView--close-button =
    .title = Закрыць акно з кодам

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Запампаваныя запісы
