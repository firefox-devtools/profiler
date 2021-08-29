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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>вебзастосунок для аналізу швидкодії { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Перейти до нашого репозиторію Git (відкриється у новому вікні)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = Не вдалося отримати профіль з { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = Не вдалося прочитати файл або проаналізувати профіль у ньому.
AppViewRouter--error-message-local =
    .message = Ще не впроваджено.
AppViewRouter--error-message-public =
    .message = Не вдалося завантажити профіль.
AppViewRouter--error-message-from-url =
    .message = Не вдалося завантажити профіль.
AppViewRouter--route-not-found--home =
    .specialMessage = URL-адреса, до якої ви намагаєтеся отримати доступ, не розпізнана.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = Об'єднати функцію
    .title =
        Об’єднання функції вилучає її з профілю та призначає її час для
        функції, яка її викликала. Це відбувається всюди, де функцію було
        викликано в дереві.
CallNodeContextMenu--transform-merge-call-node = Об'єднати лише вузол
    .title =
        Об’єднання вузла вилучає його з профілю та призначає його час для
        вузла функції, який його викликав. Це вилучає функцію лише з тієї
        певної частини дерева. Будь-які інші місця, з яких було викликано функцію,
        залишаться у профілі.
CallNodeContextMenu--transform-collapse-function-subtree = Згорнути функцію
    .title =
        Згортання функції вилучить усе, що вона викликала, і призначить
        увесь час для функції. Це може допомогти спростити профіль, що
        викликає код, який не потребує аналізу.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Згорнути <strong>{ $nameForResource }</strong>
    .title =
        Згортання ресурсу згладить усі виклики до того
        ресурсу в єдиний згорнутий вузол виклику.
CallNodeContextMenu--transform-collapse-direct-recursion = Згорнути пряму рекурсію
    .title =
        Згортання прямої рекурсії вилучає виклики, рекурсія яких повторюється
        в ту саму функцію.
CallNodeContextMenu--transform-drop-function = Покинути зразки з цією функцією
    .title =
        Якщо покинути зразки, їх час вилучається з профілю. Це корисно для
        усунення інформації про час, який не стосується аналізу.
CallNodeContextMenu--expand-all = Розгорнути все
CallNodeContextMenu--copy-function-name = Скопіювати назву функції
CallNodeContextMenu--copy-script-url = Скопіювати URL-адресу скрипту
CallNodeContextMenu--copy-stack = Копіювати стек

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Введіть URL-адреси профілів, які ви хочете порівняти
CompareHome--form-label-profile1 = Профіль 1:
CompareHome--form-label-profile2 = Профіль 2:
CompareHome--submit-button =
    .value = Отримати профілі

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Відкрити бічну панель
Details--close-sidebar-button =
    .title = Закрити бічну панель
Details--error-boundary-message =
    .message = Йой, на цій панелі сталася невідома помилка.

## Footer Links

FooterLinks--legal = Правові положення
FooterLinks--Privacy = Приватність
FooterLinks--Cookies = Куки

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Тип графіка:
FullTimeline--categories = Категорії
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible = Показано доріжки <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span>

## Home page

Home--upload-from-file-input-button = Завантажити профіль із файлу
Home--upload-from-url-button = Завантажити профіль з URL-адреси
Home--load-from-url-submit-button =
    .value = Завантажити
Home--documentation-button = Документація
Home--menu-button = Увімкнути кнопку меню { -profiler-brand-name }
Home--menu-button-instructions =
    Увімкніть кнопку меню профайлера, щоб почати запис швидкодії профілю у
    { -firefox-brand-name }, потім аналізуйте його та оприлюдніть на profiler.firefox.com.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Екземпляр профайлера не зміг з'єднатися з WebChannel, тому не вдалося увімкнути кнопку меню профайлера.
Home--instructions-title = Як переглядати та записувати профілі
Home--instructions-content =
    Для запису профілів швидкодії потрібен <a>{ -firefox-brand-name }</a>.
    Однак, наявні профілі можна переглядати в будь-якому сучасному браузері.
Home--record-instructions-start-stop = Зупинити й почати запис профілю
Home--record-instructions-capture-load = Захопити й завантажити профіль
Home--profiler-motto = Отримайте профіль швидкодії. Проаналізуйте його. Поділіться ним. Зробіть Інтернет швидшим.
Home--additional-content-title = Завантажити наявні профілі
Home--additional-content-content = Ви можете <strong>перетягнути</strong> файл профілю сюди, щоб завантажити його, або:
Home--compare-recordings-info = Ви також можете порівняти записи. <a>Відкрити інтерфейс порівняння.</a>
Home--recent-uploaded-recordings-title = Останні завантаження

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Введіть умови фільтру

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Клацніть тут, щоб завантажити профіль { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Видалити
    .title = Цей профіль не можна видалити оскільки ми не маємо інформації про авторизацію.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Жодного профілю ще не завантажено!
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Переглянути всі свої записи та керувати ними (ще { $profilesRestCount })
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Керувати цим записом
        [few] Керувати цими записами
       *[many] Керувати цими записами
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--copy-description = Скопіювати опис
MarkerContextMenu--copy-call-stack = Скопіювати стек викликів
MarkerContextMenu--copy-url = Скопіювати URL-адресу

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Почати
MarkerTable--duration = Тривалість
MarkerTable--type = Тип
MarkerTable--description = Опис

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Дані профілю
MenuButtons--index--full-view = Повний огляд
MenuButtons--index--cancel-upload = Скасувати вивантаження
MenuButtons--index--share-upload =
    .label = Вивантажити локальний профіль
MenuButtons--index--share-re-upload =
    .label = Повторно вивантажити
MenuButtons--index--share-error-uploading =
    .label = Помилка вивантаження
MenuButtons--index--revert = Повернутися до початкового профілю
MenuButtons--index--docs = Документи

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Вивантажено:
MenuButtons--index--profile-info-uploaded-actions = Видалити
MenuButtons--index--metaInfo-subtitle = Інформація про профіль
MenuButtons--metaInfo--symbols = Символи:
MenuButtons--metaInfo--cpu = ЦП:
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } фізичне ядро
        [few] { $physicalCPUs } фізичні ядра
       *[many] { $physicalCPUs } фізичних ядер
    }, { $logicalCPUs ->
        [one] { $logicalCPUs } логічне ядро
        [few] { $logicalCPUs } логічні ядра
       *[many] { $logicalCPUs } логічних ядер
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } фізичне ядро
        [few] { $physicalCPUs } фізичні ядра
       *[many] { $physicalCPUs } фізичних ядер
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } логічне ядро
        [few] { $logicalCPUs } логічні ядра
       *[many] { $logicalCPUs } логічних ядер
    }
MenuButtons--metaInfo--recording-started = Запис розпочато:
MenuButtons--metaInfo--interval = Інтервал:
MenuButtons--metaInfo--profile-version = Версія профілю:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } секунда
        [few] { $configurationDuration } секунди
       *[many] { $configurationDuration } секунд
    }
MenuButtons--metaInfo--application = Застосунок
MenuButtons--metaInfo--name-and-version = Назва та версія:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Платформа
MenuButtons--metaInfo--device = Пристрій:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = ОС:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Розширення:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.


## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--button-upload = Вивантажити
MenuButtons--publish--upload-title = Вивантаження профілю…
MenuButtons--publish--message-try-again = Повторити спробу
MenuButtons--publish--download = Завантажити
MenuButtons--publish--compressing = Стиснення…

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.


## Profile Loader Animation

ProfileLoaderAnimation--loading-message-local =
    .message = Ще не впроваджено.
ProfileLoaderAnimation--loading-message-public =
    .message = Завантаження та обробка профілю…
ProfileLoaderAnimation--loading-message-from-url =
    .message = Завантаження та обробка профілю…
ProfileLoaderAnimation--loading-message-compare =
    .message = Читання та обробка профілів…

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Встановлення…
ServiceWorkerManager--installed-button = Перезавантажити застосунок
ServiceWorkerManager--new-version-is-ready = Нова версія застосунку завантажена та готова до використання.

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-javascript = JavaScript
StackSettings--use-data-source-label = Джерело даних:

## Tab Bar for the bottom half of the analysis UI.


## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Сховати “{ $trackName }”
TrackContextMenu--show-all-tracks = Показати всі доріжки

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

UploadedRecordingsHome--title = Вивантажені записи
