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
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Фокус на функції вилучить будь-який зразок, який не містить цієї функції.
    Крім того, він повторно вкорінює дерево викликів, щоб функція була єдиним
    коренем дерева. Це може об'єднати кілька функцій викликів сайтів у профілі
    в один вузол виклику.
CallNodeContextMenu--transform-focus-function = Фокус на функції
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Фокус на функції (інвертовано)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Фокус лише на піддереві
    .title =
        Фокус на піддереві вилучить будь-який зразок, який не включає цю
        конкретну частину дерева викликів. Це витягує гілку дерева викликів,
        однак робить це лише для того єдиного вузла виклику. Усі інші виклики
        функції ігноруються.
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
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Шукати назву функції у Searchfox
CallNodeContextMenu--copy-function-name = Скопіювати назву функції
CallNodeContextMenu--copy-script-url = Скопіювати URL-адресу скрипту
CallNodeContextMenu--copy-stack = Копіювати стек

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Час роботи (мс)
    .title =
        "Загальний" час роботи включає суму всього часу,
        протягом якого ця функція знаходилась у стеку. Сюди входить час,
        протягом якого функція насправді виконувалася, а також час,
        витрачений ініціаторами з цієї функції.
CallTree--tracing-ms-self = Власний (мс)
    .title =
        "Власний" час включає лише час, коли функція була кінцем стека.
        Якщо ця функція викликала інші функції, час “інших” функцій не
        враховується. "Власний" час корисний для розуміння того, на що
        був фактично витрачений час у програмі.
CallTree--samples-total = Всього (зразки)
    .title =
        "Всього" зразків включає суму кожного зразка, де ця функція була
        виявлена у стеку. Сюди входить час, коли функція насправді виконувалася,
        а також час, витрачений ініціаторами з цієї функції.
CallTree--samples-self = Власний
    .title =
        "Власний" підрахунок зразків включає лише зразки, де функція була
        кінцем стека. Якщо ця функція викликала інші функції, час “інших” функцій
        не включається. "Власний" підрахунок корисний для розуміння того,
        на що був фактично витрачений час у програмі.
CallTree--bytes-total = Загальний розмір (байтів)
    .title =
        "Загальний розмір" включає суму всіх призначених чи звільнених байтів,
        коли ця функція знаходилась у стеку. Сюди входять як байти,
        де функція насправді виконувалася, так і байти ініціаторів викликів з цієї функції.
CallTree--bytes-self = Власний (байти)
    .title =
        "Власний" обсяг байтів включає суму всіх виділених чи звільнених байтів,
        коли функція була кінцем стеку. Якщо ця функція викликає інші функції,
        байти “інших” функцій не включаються. "Власний" обсяг байтів корисний для розуміння того,
        скільки пам'яті було фактично виділено чи звільнено у програмі.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Виберіть вузол для показу інформації про нього.

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Введіть URL-адреси профілів, які ви хочете порівняти
CompareHome--instruction-content =
    Інструмент буде витягувати дані з вибраної доріжки та діапазону для
    кожного профілю та розмістить їх в одному поданні, щоб полегшити порівняння.
CompareHome--form-label-profile1 = Профіль 1:
CompareHome--form-label-profile2 = Профіль 2:
CompareHome--submit-button =
    .value = Отримати профілі

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Цей профіль був записаний у збірці без оптимізації випуску.
        Спостереження за швидкодією може не поширюватися на користувачів випуску.

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
FullTimeline--categories-with-cpu = Категорії з CPU
FullTimeline--categories = Категорії
FullTimeline--stack-height = Висота стеку
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
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable =
    Цей екземпляр профайлера не зміг під'єднатися до WebChannel. Зазвичай це означає,
    що він працює на хості не зазначеному в налаштуваннях
    <code>devtools.performance.recording.ui-base-url</code>. Якщо ви хочете захопити нові
    профілі цим екземпляром і надати йому програмне керування кнопкою меню
    профайлера, ви можете перейти до <code>about:config</code> і змінити налаштування.
Home--record-instructions =
    Щоб розпочати запис профілю, натисніть кнопку запису або скористайтеся
    комбінацією клавіш. Під час запису профілю піктограма стає синього кольору.
    Натисніть <kbd>Захопити</kbd>, щоб завантажити дані на profiler.firefox.com.
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

JsTracerSettings--show-only-self-time = Показувати лише час власний час
    .title = Показувати лише час, проведений у вузлі виклику, нехтуючи його дочірні елементи.

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

MarkerContextMenu--start-selection-here = Почати вибір тут
MarkerContextMenu--end-selection-here = Завершити вибір тут
MarkerContextMenu--start-selection-at-marker-start = Почати вибір на <strong>початку</strong> маркера
MarkerContextMenu--start-selection-at-marker-end = Почати вибір у <strong>кінці</strong> маркера
MarkerContextMenu--end-selection-at-marker-start = Завершити вибір на <strong>початку</strong> маркера
MarkerContextMenu--end-selection-at-marker-end = Завершити вибір у <strong>кінці</strong> маркера
MarkerContextMenu--copy-description = Скопіювати опис
MarkerContextMenu--copy-call-stack = Скопіювати стек викликів
MarkerContextMenu--copy-url = Скопіювати URL-адресу
MarkerContextMenu--copy-full-payload = Копіювати повне корисне навантаження

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Фільтр маркерів:
    .title = Показувати лише маркери, що відповідають певній назві

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Виберіть маркер для показу інформації про нього.

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
MenuButtons--permalink--button =
    .label = Стороннє посилання

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
MenuButtons--metaInfo--buffer-capacity = Обсяг буфера:
MenuButtons--metaInfo--buffer-duration = Тривалість буфера:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } секунда
        [few] { $configurationDuration } секунди
       *[many] { $configurationDuration } секунд
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Необмежено
MenuButtons--metaInfo--application = Застосунок
MenuButtons--metaInfo--name-and-version = Назва та версія:
MenuButtons--metaInfo--update-channel = Канал оновлень:
MenuButtons--metaInfo--build-id = ID збірки:
MenuButtons--metaInfo--build-type = Тип збірки:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Платформа
MenuButtons--metaInfo--device = Пристрій:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = ОС:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Візуальні показники
MenuButtons--metaInfo--speed-index = Індекс швидкості:
MenuButtons--metaInfo-renderRowOfList-label-features = Можливості:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Фільтр потоків:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Розширення:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-mean = Середнє
MenuButtons--metaOverheadStatistics-max = Макс
MenuButtons--metaOverheadStatistics-min = Мін
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Очищення
    .title = Час викинути застарілі дані.
MenuButtons--metaOverheadStatistics-statkeys-interval = Інтервал:
    .title = Зафіксований інтервал між двома зразками.

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Включити приховані потоки
MenuButtons--publish--renderCheckbox-label-hidden-time = Включити прихований діапазон часу
MenuButtons--publish--renderCheckbox-label-include-screenshots = Включити знімки екрана
MenuButtons--publish--renderCheckbox-label-resource = Включити URL-адреси ресурсів та шляхи
MenuButtons--publish--renderCheckbox-label-extension = Включити відомості про розширення
MenuButtons--publish--renderCheckbox-label-preference = Включити значення параметрів
MenuButtons--publish--reupload-performance-profile = Повторно завантажити профіль швидкодії
MenuButtons--publish--share-performance-profile = Поділитися профілем швидкодії
MenuButtons--publish--info-description = Вивантажте свій профіль і зробіть його доступним для всіх, хто має посилання.
MenuButtons--publish--info-description-default = Типово ваші особисті дані вилучаються.
MenuButtons--publish--info-description-firefox-nightly = Цей профіль з { -firefox-nightly-brand-name }, тому типово включено всю інформацію.
MenuButtons--publish--include-additional-data = Включити додаткові дані, які можуть розкрити вашу ідентичність
MenuButtons--publish--button-upload = Вивантажити
MenuButtons--publish--upload-title = Вивантаження профілю…
MenuButtons--publish--cancel-upload = Скасувати вивантаження
MenuButtons--publish--message-something-went-wrong = Йой, під час вивантаження профілю сталася якась халепа.
MenuButtons--publish--message-try-again = Повторити спробу
MenuButtons--publish--download = Завантажити
MenuButtons--publish--compressing = Стиснення…

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Чи знаєте ви, що для пошуку кількох термінів можна використовувати кому (,)?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Видалити
    .title = Натисніть тут, щоб видалити профіль { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Повний спектр

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = Імпортування профілю безпосередньо з { -firefox-brand-name }…
ProfileLoaderAnimation--loading-message-from-file =
    .message = Читання файлу та обробка профілю…
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
ProfileRootMessage--additional = Повернутися на початок

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Встановлення…
ServiceWorkerManager--pending-button = Застосувати та перезавантажити
ServiceWorkerManager--installed-button = Перезавантажити застосунок
ServiceWorkerManager--new-version-is-ready = Нова версія застосунку завантажена та готова до використання.
ServiceWorkerManager--hide-notice-button =
    .title = Сховати сповіщення про перезавантаження
    .aria-label = Сховати сповіщення про перезавантаження

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = Усі стеки
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Нативні
StackSettings--use-data-source-label = Джерело даних:
StackSettings--panel-search =
    .label = Фільтр стеків:
    .title = Показувати лише стеки, що містять функцію, чия назва збігається з цим підрядком

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Дерево викликів
TabBar--flame-graph-tab = Флейм-діаграма
TabBar--stack-chart-tab = Діаграма стека
TabBar--marker-chart-tab = Маркерна діаграма
TabBar--marker-table-tab = Маркерна таблиця
TabBar--network-tab = Мережа

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = Показати лише цю групу процесів
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Показати лише “{ $trackName }”
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

# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Згорнути: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Вузол фокусування: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Сфокусуватися: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Об’єднати вузол: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Об’єднати: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion = Згорнути рекурсію: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Згорнути піддерево: { $item }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Вивантажені записи
