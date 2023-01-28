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
-firefox-android-brand-name = Firefox для Android
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

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Паказаць <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Аб'яднаць функцыю
    .title =
        Аб'яднанне функцыі выдаляе яе з профілю і прызначае яе час
        функцыі, якая яе выклікала. Гэта адбываецца ўсюды, дзе функцыя была
        выклікана ў дрэве.
CallNodeContextMenu--transform-focus-function = Фокус на функцыі
    .title = { CallNodeContextMenu--transform-focus-function-title }
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
CallTree--samples-total = Усяго (узоры)
    .title = Лічыльнік “Усяго (узоры)” уключае ў сабе суму кожнага ўзору, у якога гэтая функцыя была выяўлена ў стэку. Сюды ўваходзіць час фактычнай працы функцыі, а таксама час, чакання вызаваў, якія рабіла гэтая функцыя.

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
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Выберыце паток-атрымальнік “<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Выберыце паток-адпраўнік “<strong>{ $threadName }</strong>”

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
MenuButtons--permalink--button =
    .label = Пастаянная спасылка

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
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } фізічнае ядро
        [few] { $physicalCPUs } фізічных ядра
       *[many] { $physicalCPUs } фізічных ядзер
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } лагічнае ядро
        [few] { $logicalCPUs } лагічных ядра
       *[many] { $logicalCPUs } лагічных ядзер
    }
MenuButtons--metaInfo--main-process-started = Асноўны працэс пачаўся:
MenuButtons--metaInfo--main-process-ended = Асноўны працэс скончыўся:
MenuButtons--metaInfo--interval = Інтэрвал:
MenuButtons--metaInfo--buffer-capacity = Ёмістасць буфера:
MenuButtons--metaInfo--buffer-duration = Працягласць буфера:
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Неабмежавана
MenuButtons--metaInfo--application = Праграма
MenuButtons--metaInfo--name-and-version = Назва і версія:
MenuButtons--metaInfo--update-channel = Канал абнаўлення:
MenuButtons--metaInfo--build-id = ID зборкі:
MenuButtons--metaInfo--build-type = Тып зборкі:
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
MenuButtons--metaInfo--visual-metrics = Візуальныя паказчыкі
MenuButtons--metaInfo--speed-index = Індэкс хуткасці:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Індэкс "Perceptual Speed":
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Індэкс "Contentful Speed":
MenuButtons--metaInfo-renderRowOfList-label-features = Магчымасці:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Фільтр патокаў:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Пашырэнні:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-mean = Сярэдняе
MenuButtons--metaOverheadStatistics-max = Макс
MenuButtons--metaOverheadStatistics-min = Мін
MenuButtons--metaOverheadStatistics-statkeys-counter = Лічыльнік
    .title = Час збору ўсіх лічыльнікаў
MenuButtons--metaOverheadStatistics-statkeys-interval = Інтэрвал
    .title = Зафіксаваны інтэрвал паміж двума ўзорамі
MenuButtons--metaOverheadStatistics-profiled-duration = Працягласць запісу профілю:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-include-other-tabs = Уключыць даныя з іншых картак
MenuButtons--publish--renderCheckbox-label-extension = Уключыць інфармацыю аб пашырэнні
MenuButtons--publish--renderCheckbox-label-private-browsing = Уключыць даныя з вокнаў прыватнага прагляду
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Гэты профіль змяшчае даныя прыватнага прагляду
MenuButtons--publish--reupload-performance-profile = Паўторна запампаваць профіль прадукцыйнасці
MenuButtons--publish--share-performance-profile = Абагуліць профіль прадукцыйнасці
MenuButtons--publish--info-description = Запампуйце свой профіль і зрабіце яго даступным для ўсіх, хто мае спасылку.
MenuButtons--publish--info-description-default = Тыпова вашы асабістыя даныя выдаляюцца.
MenuButtons--publish--button-upload = Запампаваць
MenuButtons--publish--upload-title = Запампоўванне профілю…
MenuButtons--publish--cancel-upload = Скасаваць запампоўку
MenuButtons--publish--message-try-again = Паспрабаваць зноў
MenuButtons--publish--download = Спампаваць
MenuButtons--publish--compressing = Сцісканне…

## NetworkSettings
## This is used in the network chart.


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

## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Выдаліць
    .title = Націсніце тут, каб выдаліць профіль { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Выдаліць { $profileName }
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

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Поўны дыяпазон ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-local = Яшчэ не рэалізавана.
ProfileLoaderAnimation--loading-public = Спампоўка і апрацоўка профілю…
ProfileLoaderAnimation--loading-from-url = Спампоўка і апрацоўка профілю…
ProfileLoaderAnimation--loading-compare = Чытанне і апрацоўка профіляў…
ProfileLoaderAnimation--loading-view-not-found = Прагляд не знойдзены

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Вярнуцца на галоўную

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Прымяненне…
ServiceWorkerManager--pending-button = Прымяніць і перазагрузіць
ServiceWorkerManager--installed-button = Перазагрузіць праграму
ServiceWorkerManager--updated-while-not-ready = Новая версія праграмы была прыменена да поўнай загрузкі гэтай старонкі. Вы можаце сутыкнуцца з няспраўнасцямі.
ServiceWorkerManager--new-version-is-ready = Новая версія праграмы спампавана і гатова да выкарыстання.
ServiceWorkerManager--hide-notice-button =
    .title = Схаваць паведамленне аб перазагрузцы
    .aria-label = Схаваць паведамленне аб перазагрузцы

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = Усе стэкі
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Уласны
StackSettings--use-data-source-label = Крыніца даных:
StackSettings--call-tree-strategy-timing = Таймінгі
    .title = Стварыць зводку асобных стэкаў кода, выкананых за пэўны перыяд часу
StackSettings--call-tree-strategy-js-allocations = Выдзяленне рэсурсаў JavaScript
    .title = Сумаваць выдзеленыя байты JavaScript (без вызвалення)
StackSettings--call-tree-strategy-native-retained-allocations = Утрыманая памяць
    .title = Сумаваць байты памяці, якія былі выдзелены, але ніколі не вызваляліся ў бягучым выбары папярэдняга прагляду
StackSettings--call-tree-native-allocations = Выдзеленая памяць
    .title = Сумаваць байты выдзеленай памяці
StackSettings--call-tree-strategy-native-deallocations-memory = Вызваленая памяць
    .title = Сумаваць байты вызваленай памяці па сайтах, дзе яны былі выдзелены
StackSettings--call-tree-strategy-native-deallocations-sites = Вызваленыя сайты
    .title = Сумаваць байты вызваленай памяці па сайтах, дзе яны былі вызвалены

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Дрэва выклікаў
TabBar--flame-graph-tab = Флэйм-дыяграма
TabBar--marker-chart-tab = Маркерная дыяграма
TabBar--marker-table-tab = Маркерная табліца
TabBar--network-tab = Сетка
TabBar--js-tracer-tab = JS Tracer

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Паказваць толькі гэты працэс
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Паказваць толькі “{ $trackName }”
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Схаваць “{ $trackName }”

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track


## TrackPower
## This is used to show the power used by the CPU and other chips in a computer,
## graphed over time.
## It's not always displayed in the UI, but an example can be found at
## https://share.firefox.dev/3a1fiT7.
## For the strings in this group, the carbon dioxide equivalent is computed from
## the used energy, using the carbon dioxide equivalent for electricity
## consumption. The carbon dioxide equivalent represents the equivalent amount
## of CO₂ to achieve the same level of global warming potential.


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
