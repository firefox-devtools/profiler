# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox для Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Профайлер
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>вебзастосунок для аналізу швидкодії { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Перейти до нашого репозиторію Git (відкриється у новому вікні)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Не вдалося імпортувати профіль.
AppViewRouter--error-unpublished = Не вдалося відновити профіль із { -firefox-brand-name }.
AppViewRouter--error-from-file = Не вдалося прочитати файл або проаналізувати профіль у ньому.
AppViewRouter--error-local = Ще не впроваджено.
AppViewRouter--error-public = Не вдалося завантажити профіль.
AppViewRouter--error-from-url = Не вдалося завантажити профіль.
AppViewRouter--error-compare = Не вдалося відновити профілі.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    Через <a>обмеження в Safari</a> { -profiler-brand-name } не може
    імпортувати профілі з локальної машини у цей браузер. Натомість
    відкрийте цю сторінку в { -firefox-brand-name } або Chrome.
    .title = Safari не може імпортувати локальні профілі
AppViewRouter--route-not-found--home =
    .specialMessage = URL-адреса, до якої ви намагаєтеся отримати доступ, не розпізнана.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Показати <strong>{ $fileName }</strong>
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
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Фокус на категорії <strong>{ $categoryName }</strong>
    .title =
        Фокусування на вузлах, які належать тій самій категорії що й вибраний вузол,
        об'єднуючи таким чином усі вузли, які належать іншій категорії.
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
CallNodeContextMenu--transform-collapse-recursion = Згорнути рекурсію
    .title =
        Згортання рекурсії вилучає виклики, які повторювано звертаються
        до тієї самої функції, навіть з проміжними функціями у стеку.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Згорнути лише пряму рекурсію
    .title =
        Згортання прямої рекурсії вилучає виклики, які повторювано звертаються
        до тієї самої функції без проміжних функцій у стеку.
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
CallNodeContextMenu--show-the-function-in-devtools = Показати функцію в інструментах розробника

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

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Деякі виклики до { $calledFunction } не були вбудовані компілятором.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (вбудовані)
    .title = Виклики до { $calledFunction } були вбудовані компілятором в { $outerFunction }.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Виберіть вузол для показу інформації про нього.
CallTreeSidebar--call-node-details = Подробиці вузла виклику

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

CallTreeSidebar--traced-running-time =
    .label = Відстежувана тривалість роботи
CallTreeSidebar--traced-self-time =
    .label = Відстежувана самостійно тривалість
CallTreeSidebar--running-time =
    .label = Тривалість роботи
CallTreeSidebar--self-time =
    .label = Власний час
CallTreeSidebar--running-samples =
    .label = Виконувані зразки
CallTreeSidebar--self-samples =
    .label = Власні зразки
CallTreeSidebar--running-size =
    .label = Виконуваний розмір
CallTreeSidebar--self-size =
    .label = Власний розмір
CallTreeSidebar--categories = Категорії
CallTreeSidebar--implementation = Імплементація
CallTreeSidebar--running-milliseconds = Виконання - мілісекунд
CallTreeSidebar--running-sample-count = Кількість виконуваних зразків
CallTreeSidebar--running-bytes = Виконувані байти
CallTreeSidebar--self-milliseconds = Власні - мілісекунд
CallTreeSidebar--self-sample-count = Кількість власних зразків
CallTreeSidebar--self-bytes = Власні - байтів

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

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Будь ласка, повідомте про цю проблему розробникам, додавши
    усю помилку, показану у вебконсолі Інструментів розробника.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Повідомити про помилку на GitHub

## Footer Links

FooterLinks--legal = Правові положення
FooterLinks--Privacy = Приватність
FooterLinks--Cookies = Файли cookie
FooterLinks--languageSwitcher--select =
    .title = Змінити мову
FooterLinks--hide-button =
    .title = Сховати посилання нижнього колонтитула
    .aria-label = Сховати посилання нижнього колонтитула

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = Доріжок: <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span>

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
Home--profile-firefox-android-instructions =
    Ви також можете створити профіль { -firefox-android-brand-name }. За
    подробицями зверніться до цієї документації:
    <a>Профілювання { -firefox-android-brand-name } безпосередньо на пристрої</a>.
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
Home--instructions-content =
    Для запису профілів швидкодії потрібен <a>{ -firefox-brand-name }</a>.
    Однак, наявні профілі можна переглядати в будь-якому сучасному браузері.
Home--record-instructions-start-stop = Зупинити й почати запис профілю
Home--record-instructions-capture-load = Захопити й завантажити профіль
Home--profiler-motto = Отримайте профіль швидкодії. Проаналізуйте його. Поділіться ним. Зробіть Інтернет швидшим.
Home--additional-content-title = Завантажити наявні профілі
Home--additional-content-content = Ви можете <strong>перетягнути</strong> файл профілю сюди, щоб завантажити його, або:
Home--compare-recordings-info = Ви також можете порівняти записи. <a>Відкрити інтерфейс порівняння.</a>
Home--your-recent-uploaded-recordings-title = Ваші недавно вивантажені записи
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } також може імпортувати профілі з інших профайлерів, як-от
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>,
    Панель швидкодії Chrome, <androidstudio>Android Studio</androidstudio>, або
    з будь-якого файлу в форматі <dhat>dhat</dhat> чи <traceevent>Google’s Trace Event</traceevent>.
    <write>Навчіться записувати власний імпортер</write>.
Home--install-chrome-extension = Встановіть розширення Chrome
Home--chrome-extension-instructions =
    Використовуйте розширення <a>{ -profiler-brand-name } для Chrome</a>
    для фіксації профілів продуктивності в Chrome та їх аналізу в
    { -profiler-brand-name }. Установіть розширення з вебмагазину Chrome.
Home--chrome-extension-recording-instructions =
    Після встановлення використовуйте піктограму розширення на панелі інструментів
    або ярлики для запуску та зупинки профілювання. Ви також можете
    експортувати профілі та завантажити їх тут для детального аналізу.

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
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
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

MarkerContextMenu--set-selection-from-duration = Налаштуйте вибірку на основі тривалості маркера
MarkerContextMenu--start-selection-here = Почати вибірку звідси
MarkerContextMenu--end-selection-here = Завершити вибірку тут
MarkerContextMenu--start-selection-at-marker-start = Почати вибірку від <strong>початку</strong> маркера
MarkerContextMenu--start-selection-at-marker-end = Почати вибірку в <strong>кінці</strong> маркера
MarkerContextMenu--end-selection-at-marker-start = Завершити вибірку на <strong>початку</strong> маркера
MarkerContextMenu--end-selection-at-marker-end = Завершити вибірку в <strong>кінці</strong> маркера
MarkerContextMenu--copy-description = Скопіювати опис
MarkerContextMenu--copy-call-stack = Скопіювати стек викликів
MarkerContextMenu--copy-url = Скопіювати URL-адресу
MarkerContextMenu--copy-page-url = Копіювати URL-адресу сторінки
MarkerContextMenu--copy-as-json = Скопіювати як JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Виберіть потік-одержувач “<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Виберіть потік-відправник “<strong>{ $threadName }</strong>”

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Перетягніть зразки за межі маркерів, що відповідають “<strong>{ $filter }</strong>”

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Фільтр маркерів:
    .title = Показувати лише маркери, що відповідають певній назві
MarkerSettings--marker-filters =
    .title = Фільтр маркерів

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Виберіть маркер для показу інформації про нього.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Почати
MarkerTable--duration = Тривалість
MarkerTable--name = Назва
MarkerTable--details = Подробиці

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
MenuButtons--metaInfo--profile-symbolicated = Профіль символізований
MenuButtons--metaInfo--profile-not-symbolicated = Профіль не символізований
MenuButtons--metaInfo--resymbolicate-profile = Повторно символізувати профіль
MenuButtons--metaInfo--symbolicate-profile = Символізувати профіль
MenuButtons--metaInfo--attempting-resymbolicate = Спроба повторно символізувати профіль
MenuButtons--metaInfo--currently-symbolicating = Наразі профіль символізується
MenuButtons--metaInfo--cpu-model = Модель ЦП:
MenuButtons--metaInfo--cpu-cores = Ядра ЦП:
MenuButtons--metaInfo--main-memory = Основна пам'ять:
MenuButtons--index--show-moreInfo-button = Показати більше
MenuButtons--index--hide-moreInfo-button = Показати менше
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } фізичне ядро, { $logicalCPUs } логічне ядро
                [few] { $physicalCPUs } фізичне ядро, { $logicalCPUs } логічні ядра
               *[many] { $physicalCPUs } фізичне ядро, { $logicalCPUs } логічних ядер
            }
        [few]
            { $logicalCPUs ->
                [one] { $physicalCPUs } фізичні ядра, { $logicalCPUs } логічне ядро
                [few] { $physicalCPUs } фізичні ядра, { $logicalCPUs } логічні ядра
               *[many] { $physicalCPUs } фізичні ядра, { $logicalCPUs } логічних ядер
            }
       *[many]
            { $logicalCPUs ->
                [one] { $physicalCPUs } фізичних ядер, { $logicalCPUs } логічне ядро
                [few] { $physicalCPUs } фізичних ядер, { $logicalCPUs } логічні ядра
               *[many] { $physicalCPUs } фізичних ядер, { $logicalCPUs } логічних ядер
            }
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
MenuButtons--metaInfo--profiling-started = Запис розпочато:
MenuButtons--metaInfo--profiling-session = Тривалість запису:
MenuButtons--metaInfo--main-process-started = Основний процес розпочато:
MenuButtons--metaInfo--main-process-ended = Основний процес завершено:
MenuButtons--metaInfo--interval = Інтервал:
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
MenuButtons--metaInfo--application-uptime = Час роботи:
MenuButtons--metaInfo--update-channel = Канал оновлень:
MenuButtons--metaInfo--build-id = ID збірки:
MenuButtons--metaInfo--build-type = Тип збірки:
MenuButtons--metaInfo--arguments = Аргументи:

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
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Індекс "Perceptual Speed":
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Індекс "Contentful Speed":
MenuButtons--metaInfo-renderRowOfList-label-features = Можливості:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Фільтр потоків:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Розширення:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Ресурси, які споживає { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Середнє
MenuButtons--metaOverheadStatistics-max = Макс
MenuButtons--metaOverheadStatistics-min = Мін
MenuButtons--metaOverheadStatistics-statkeys-overhead = Спожиті для роботи ресурси
    .title = Час отримання всіх потоків.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Очищення
    .title = Час викинути застарілі дані.
MenuButtons--metaOverheadStatistics-statkeys-counter = Лічильник
    .title = Час збору всіх лічильників
MenuButtons--metaOverheadStatistics-statkeys-interval = Інтервал:
    .title = Зафіксований інтервал між двома зразками.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Блокування
    .title = Час до блокування перед виконанням вимірювань.
MenuButtons--metaOverheadStatistics-overhead-duration = Тривалість споживання ресурсів на роботу:
MenuButtons--metaOverheadStatistics-overhead-percentage = Відсоток спожитих на роботу ресурсів:
MenuButtons--metaOverheadStatistics-profiled-duration = Тривалість запису профілю:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Включити приховані потоки
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Включити дані з інших вкладок
MenuButtons--publish--renderCheckbox-label-hidden-time = Включити прихований діапазон часу
MenuButtons--publish--renderCheckbox-label-include-screenshots = Включити знімки екрана
MenuButtons--publish--renderCheckbox-label-resource = Включити URL-адреси ресурсів та шляхи
MenuButtons--publish--renderCheckbox-label-extension = Включити відомості про розширення
MenuButtons--publish--renderCheckbox-label-preference = Включити значення параметрів
MenuButtons--publish--renderCheckbox-label-private-browsing = Включити дані з вікон приватного перегляду
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Цей профіль містить дані приватного перегляду
MenuButtons--publish--reupload-performance-profile = Повторно завантажити профіль швидкодії
MenuButtons--publish--share-performance-profile = Поділитися профілем швидкодії
MenuButtons--publish--info-description = Вивантажте свій профіль і зробіть його доступним для всіх, хто має посилання.
MenuButtons--publish--info-description-default = Типово ваші особисті дані вилучаються.
MenuButtons--publish--info-description-firefox-nightly2 = Цей профіль з { -firefox-nightly-brand-name }, тому типово включено більшість інформації.
MenuButtons--publish--include-additional-data = Включити додаткові дані, які можуть розкрити вашу ідентичність
MenuButtons--publish--button-upload = Вивантажити
MenuButtons--publish--upload-title = Вивантаження профілю…
MenuButtons--publish--cancel-upload = Скасувати вивантаження
MenuButtons--publish--message-something-went-wrong = Йой, під час вивантаження профілю сталася якась халепа.
MenuButtons--publish--message-try-again = Повторити спробу
MenuButtons--publish--download = Завантажити
MenuButtons--publish--compressing = Стиснення…
MenuButtons--publish--error-while-compressing = Помилка під час стиснення, спробуйте прибрати прапорці біля деяких полів, щоб зменшити розмір профілю.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Фільтрувати мережі:
    .title = Показувати лише запити мережі, яка відповідає певній назві

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

PanelSearch--search-field-hint = Чи знаєте ви, що для пошуку кількох термінів можна використовувати кому (,)?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Змінити назву профілю
ProfileName--edit-profile-name-input =
    .title = Змінити назву профілю
    .aria-label = Назва профілю

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Видалити
    .title = Натисніть тут, щоб видалити профіль { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Під час видалення цього профілю сталася помилка. <a>Наведіть курсор, щоб дізнатися більше.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Видалити { $profileName }
ProfileDeletePanel--dialog-confirmation-question =
    Ви впевнені, що хочете видалити вивантажені дані для цього профілю? Посилання,
    які раніше були поширені більше не працюватимуть.
ProfileDeletePanel--dialog-cancel-button =
    .value = Скасувати
ProfileDeletePanel--dialog-delete-button =
    .value = Видалити
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Видалення…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Вивантажені дані було успішно видалено.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Повний діапазон ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Імпорт та обробка профілю…
ProfileLoaderAnimation--loading-unpublished = Імпортування профілю безпосередньо з { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Читання файлу та обробка профілю…
ProfileLoaderAnimation--loading-local = Ще не впроваджено.
ProfileLoaderAnimation--loading-public = Завантаження та обробка профілю…
ProfileLoaderAnimation--loading-from-url = Завантаження та обробка профілю…
ProfileLoaderAnimation--loading-compare = Читання та обробка профілів…
ProfileLoaderAnimation--loading-view-not-found = Перегляд не знайдено

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Повернутися на початок

## Root

Root--error-boundary-message =
    .message = Йой, на profiler.firefox.com сталася невідома помилка.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Застосовується…
ServiceWorkerManager--pending-button = Застосувати та перезавантажити
ServiceWorkerManager--installed-button = Перезавантажити застосунок
ServiceWorkerManager--updated-while-not-ready =
    Нова версія програми була застосована до повного
    завантаження цієї сторінки. Ви можете зіткнутися з несправностями.
ServiceWorkerManager--new-version-is-ready = Нова версія застосунку завантажена та готова до використання.
ServiceWorkerManager--hide-notice-button =
    .title = Сховати сповіщення про перезавантаження
    .aria-label = Сховати сповіщення про перезавантаження

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-frames = Усі фрейми
    .title = Не фільтрувати фрейми стека
StackSettings--implementation-native2 = Вбудовані
    .title = Показувати лише фрейми стека для власного коду
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Фільтр стеків:
StackSettings--use-data-source-label = Джерело даних:
StackSettings--call-tree-strategy-timing = Таймінги
    .title = Створити підсумок окремих стеків виконаного впродовж певного часу коду
StackSettings--call-tree-strategy-js-allocations = Розподіл ресурсів JavaScript
    .title = Підсумовувати розподілені байти JavaScript (без вивільнених)
StackSettings--call-tree-strategy-native-retained-allocations = Утримана пам'ять
    .title = Підсумовувати байти пам'яті, яку було розподілено, але ніколи не звільнено у поточній виборці вигляду
StackSettings--call-tree-native-allocations = Розподілена пам'ять
    .title = Підсумовувати байти розподіленої пам'яті
StackSettings--call-tree-strategy-native-deallocations-memory = Вивільнена пам'ять
    .title = Підсумовувати байти вивільненої сайтом пам'яті, для якого її було виділено
StackSettings--call-tree-strategy-native-deallocations-sites = Вивільнені сайти
    .title = Підсумовувати байти вивільненої сайтом пам'яті, на якому її було вивільнено
StackSettings--invert-call-stack = Інвертувати стек викликів
    .title = Сортувати за часом, витраченим у вузлі виклику, ігноруючи його дочірні вузли.
StackSettings--show-user-timing = Показати таймінги користувача
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
TabBar--js-tracer-tab = JS Tracer

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Усі вкладки та вікна

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Показувати лише ці процеси
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Показати лише “{ $trackName }”
TrackContextMenu--hide-other-screenshots-tracks = Сховати доріжки інших знімків
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Сховати “{ $trackName }”
TrackContextMenu--show-all-tracks = Показати всі доріжки
TrackContextMenu--show-local-tracks-in-process = Показати всі доріжки в цьому процесі
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Приховати всі доріжки типу “{ $type }”
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Показати всі відповідні доріжки
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Сховати всі відповідні доріжки
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Не знайдено результатів за запитом “<span>{ $searchFilter }</span>”
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Сховати доріжку
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Сховати процес

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = відносна пам'ять на цю мить
TrackMemoryGraph--memory-range-in-graph = діапазон пам'яті в графіку
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = розподіл і вивільнення після попереднього зразка

## TrackPower
## This is used to show the power used by the CPU and other chips in a computer,
## graphed over time.
## It's not always displayed in the UI, but an example can be found at
## https://share.firefox.dev/3a1fiT7.
## For the strings in this group, the carbon dioxide equivalent is computed from
## the used energy, using the carbon dioxide equivalent for electricity
## consumption. The carbon dioxide equivalent represents the equivalent amount
## of CO₂ to achieve the same level of global warming potential.

# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-kilowatt = { $value } кВт
    .label = Потужність
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } Вт
    .label = Потужність
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } мВт
    .label = Потужність
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } кВт
    .label = Середня потужність у поточній вибірці
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } Вт
    .label = Середня потужність у поточній вибірці
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } мВт
    .label = Середня потужність у поточній вибірці
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } кВт·год ({ $carbonValue } кг CO₂e)
    .label = Використана у видимому діапазоні енергія
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Вт·год ({ $carbonValue } г CO₂e)
    .label = Спожита у видимому діапазоні енергія
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } мВт·год ({ $carbonValue } мг CO₂е)
    .label = Спожита у видимому діапазоні енергія
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } мкВт·год ({ $carbonValue } мг CO₂e)
    .label = Спожита у видимому діапазоні енергія
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } кВт·год ({ $carbonValue } кг CO₂e)
    .label = Використана у поточній вибірці енергія
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Вт·год ({ $carbonValue } г CO₂e)
    .label = Спожита у поточній вибірці енергія
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } мВт·год ({ $carbonValue } мг CO₂е)
    .label = Спожита у поточній вибірці енергія
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } мкВт·год ({ $carbonValue } мг CO₂e)
    .label = Спожита у поточній вибірці енергія

## TrackBandwidth
## This is used to show how much data was transfered over time.
## For the strings in this group, the carbon dioxide equivalent is estimated
## from the amount of data transfered.
## The carbon dioxide equivalent represents the equivalent amount
## of CO₂ to achieve the same level of global warming potential.

# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the value for the data transfer speed.
#                     Will contain the unit (eg. B, KB, MB)
TrackBandwidthGraph--speed = { $value } за секунду
    .label = Швидкість передавання для цього зразка
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = операцій читання/запису від попереднього зразка
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } г CO₂e)
    .label = Дані, передані до цього часу
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } г CO₂e)
    .label = Дані, передані у видимому діапазоні
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } г CO₂e)
    .label = Дані, передані в поточному виборі

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Введіть умови фільтра
    .title = Показ лише доріжок, які збігаються з певним текстом

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
TransformNavigator--complete = Виконано “{ $item }”
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
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Категорія в фокусі: { $item }
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
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Відкинуто: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Згорнути рекурсію: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Згорнути лише пряму рекурсію: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Згорнути піддерево: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Перетягніть зразки за межі маркерів, що відповідають: “{ $item }”

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Очікування відповіді з { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Очікування { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Програмний код недоступний
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Перегляньте <a>обговорення #3741</a>, щоб дізнатися про підтримувані сценарії та заплановані вдосконалення.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Код асемблера недоступний
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Перегляньте <a>обговорення #4520</a>, щоб дізнатися про підтримувані сценарії та заплановані вдосконалення.
SourceView--close-button =
    .title = Закрити вікно з кодом

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Для цього файлу немає відомої cross-origin-accessible URL-адреси.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Під час отримання URL-адреси { $url } сталася помилка мережі: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Не вдалося запитати API символізації браузера: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = API символізації браузера повернув помилку: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = API символізації локального сервера символів повернув помилку: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = API символізації браузера повернув неправильну відповідь: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = API символізації локального сервера символів повернув неправильну відповідь: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Файл { $pathInArchive } не знайдено в архіві з { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Не вдалося проаналізувати архів за адресою { $url }: { $parsingErrorMessage }

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Показати перегляд асемблера
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Сховати перегляд асемблера

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Вивантажені записи
