# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox для Android
-profiler-brand-name = Профайлер Firefox
-profiler-brand-short-name = Профайлер
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Веб-приложение для анализа производительности { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Перейдите в наш репозиторий Git (он откроется в новом окне)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Не удалось импортировать профиль.
AppViewRouter--error-unpublished = Не удалось получить профиль из { -firefox-brand-name }.
AppViewRouter--error-from-file = Не удалось прочитать файл или проанализировать профиль в нем.
AppViewRouter--error-local = Пока не реализовано.
AppViewRouter--error-public = Не удалось скачать профиль.
AppViewRouter--error-from-url = Не удалось скачать профиль.
AppViewRouter--error-compare = Не удалось получить профили.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    Из-за <a>особого ограничения Safari</a> { -profiler-brand-name } не может
    импортировать профили с локальной машины в этот браузер. Пожалуйста, откройте
    эту страницу в { -firefox-brand-name } или Chrome.
    .title = Safari не может импортировать локальные профили
AppViewRouter--route-not-found--home =
    .specialMessage = URL-адрес, который вы пытались открыть, не был распознан.

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (встроенный)
    .title = { $function } был встроен компилятором в вызывающий объект.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Показать <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Слить функцию
    .title =
        Слияние функции удаляет её из профиля и присваивает её время
        функции, которая её вызвала. Это происходит везде, где функция была вызвана в
        дереве.
CallNodeContextMenu--transform-merge-call-node = Слить только узел
    .title =
        Слияние узла удаляет его из профиля и назначает его время узлу
        функции, которая его вызвала. Это удаляет функцию только из этой
        конкретной части дерева. Любые другие места, из которых была вызвана функция,
        останутся в профиле.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Фокусировка на функции удалит любой сэмпл, который не включает в себя эту
    функцию. Кроме того, она переустанавливает дерево вызовов так, чтобы функция
    являлась единственным корнем дерева. Это может объединить несколько функций, вызывающих сайты
    по всему профилю, в один узел вызова.
CallNodeContextMenu--transform-focus-function = Сфокусироваться на функции
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Сфокусироваться на функции (инвертировано)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Сфокусироваться только на поддереве
    .title =
        Фокусировка на поддереве приведёт к удалению любого сэмпла, который не включает эту
        конкретную часть дерева вызовов. Она извлекает ветвь дерева вызовов,
        однако делает это только для этого единственного узла вызова. Все остальные вызовы
        функции игнорируются.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Сфокусироваться на категории <strong>{ $categoryName }</strong>
    .title =
        Фокусировка на узлах, принадлежащих к той же категории, что и выбранный узел,
        тем самым объединяя все узлы, принадлежащие к другой категории.
CallNodeContextMenu--transform-collapse-function-subtree = Свернуть функцию
    .title =
        Сворачивание функции приведёт к удалению всего, что она вызвала, и назначению
        функции всего времени. Это может помочь упростить профиль, который
        вызывает код, не нуждающийся в анализе.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Свернуть <strong>{ $nameForResource }</strong>
    .title =
        Сворачивание ресурса сведёт все вызовы к этому
        ресурсу в один свёрнутый узел вызова.
CallNodeContextMenu--transform-collapse-recursion = Свернуть рекурсию
    .title =
        Сворачивание рекурсии удаляет вызовы, которые многократно рекурсируют в
        одну и ту же функцию, даже с промежуточными функциями в стеке.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Свернуть только прямую рекурсию
    .title =
        Сворачивание прямой рекурсии удаляет вызовы, которые многократно рекурсируют в
        одну и ту же функцию без промежуточных функций в стеке.
CallNodeContextMenu--transform-drop-function = Сбросить сэмплы с этой функцией
    .title =
        Сброс сэмплов удаляет их время из профиля. Это полезно для
        устранения временной информации, которая не имеет отношения к анализу.
CallNodeContextMenu--expand-all = Развернуть всё
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Найти название функции на Searchfox
CallNodeContextMenu--copy-function-name = Скопировать имя функции
CallNodeContextMenu--copy-script-url = Скопировать URL сценария
CallNodeContextMenu--copy-stack = Скопировать стек
CallNodeContextMenu--show-the-function-in-devtools = Показать функцию в DevTools

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Время работы (мс)
    .title =
        «Общее» время выполнения включает в себя сводку всего времени, в течение которого наблюдалось нахождение этой
        функции в стеке. Это включает в себя время, когда
        функция фактически была запущена, и время, проведенное в вызывающих из
        этой функции.
CallTree--tracing-ms-self = Собственное (мс)
    .title =
        «Собственное» время включает в себя только то время, когда функция была
        концом стека. Если эта функция вызывается в других функциях,
        то время работы «других» функций не учитывается. «Собственное» время полезно
        для понимания того, на что на самом деле было потрачено время в программе.
CallTree--samples-total = Общее (семплы)
    .title =
        «Общее» количество семплов включает в себя сводку по каждому семплу, в котором
        было обнаружено наличие этой функции в стеке. Оно включает в себя время, когда
        функция фактически была запущена, и время, проведенное в вызывающих из этой
        функции.
CallTree--samples-self = Собственные
    .title =
        Количество «собственных» семплов включает только те семплы, в которых функция была
        концом стека. Если эта функция вызывается в других функциях,
        то количество «других» функций не учитывается. Подсчет «собственных» полезен
        для понимания того, сколько времени на самом деле было потрачено в программе.
CallTree--bytes-total = Общий размер (байты)
    .title =
        «Общий размер» включает в себя сумму всех байтов, выделенных или
        освобожденных за то время, пока эта функция находилась в стеке. Он
        включает в себя как байты, в которых функция фактически выполнялась, так и
        байты вызывающих из этой функции.
CallTree--bytes-self = Собственные (байты)
    .title =
        «Собственные» байты включают в себя байты, выделенные или освобожденные в то время, когда эта
        функция была концом стека. Если эта функция вызывается в
        других функциях, то байты «других» функций не включаются.
        «Собственные» байты полезны для понимания того, где на самом деле
        была выделена или освобождена память в программе.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Некоторые вызовы { $calledFunction } были встроены компилятором.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (встроенный)
    .title = Вызовы { $calledFunction } были встроены компилятором в { $outerFunction }.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Выберите узел, чтобы отобразить информацию о нем.
CallTreeSidebar--call-node-details = Подробности вызова узла

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
    .label = Отслеживаемое время работы
CallTreeSidebar--traced-self-time =
    .label = Отслеживаемое собственное время
CallTreeSidebar--running-time =
    .label = Время работы
CallTreeSidebar--self-time =
    .label = Собственное время
CallTreeSidebar--running-samples =
    .label = Запущенные семплы
CallTreeSidebar--self-samples =
    .label = Собственные семплы
CallTreeSidebar--running-size =
    .label = Запущенный размер
CallTreeSidebar--self-size =
    .label = Собственный размер
CallTreeSidebar--categories = Категории
CallTreeSidebar--implementation = Реализация
CallTreeSidebar--running-milliseconds = Запущенные миллисекунды
CallTreeSidebar--running-sample-count = Число запущенных семплов
CallTreeSidebar--running-bytes = Запущенные байты
CallTreeSidebar--self-milliseconds = Собственные миллисекунды
CallTreeSidebar--self-sample-count = Число собственных семплов
CallTreeSidebar--self-bytes = Собственные байты

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Введите URL-адреса профилей, которые вы хотите сравнить
CompareHome--instruction-content =
    Инструмент извлечет данные из выбранного трека и диапазона для
    каждого профиля и поместит их оба на один и тот же вид, чтобы упростить их
    сравнение.
CompareHome--form-label-profile1 = Профиль 1:
CompareHome--form-label-profile2 = Профиль 2:
CompareHome--submit-button =
    .value = Получить профили

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Этот профиль был записан в сборке без оптимизаций релиза.
        Наблюдения за производительностью могут не относиться к пользователям релиза.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Открыть боковую панель
Details--close-sidebar-button =
    .title = Закрыть боковую панель
Details--error-boundary-message =
    .message = О, в этой панели произошла неизвестная ошибка.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description = Пожалуйста, сообщите об этой проблеме разработчикам, включая полный текст ошибки, отображаемый в Веб-консоли Инструментов разработчика.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Сообщить об ошибке на GitHub

## Footer Links

FooterLinks--legal = Юридическая информация
FooterLinks--Privacy = Приватность
FooterLinks--Cookies = Куки
FooterLinks--languageSwitcher--select =
    .title = Изменить язык
FooterLinks--hide-button =
    .title = Скрыть ссылки в нижнем колонтитуле
    .aria-label = Скрыть ссылки в нижнем колонтитуле

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = Треки <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span>

## Home page

Home--upload-from-file-input-button = Загрузить профиль из файла
Home--upload-from-url-button = Загрузить профиль из URL-адреса
Home--load-from-url-submit-button =
    .value = Загрузить
Home--documentation-button = Документация
Home--menu-button = Включить кнопку меню { -profiler-brand-name }
Home--menu-button-instructions =
    Включите кнопку меню профайлера, чтобы начать запись производительности
    профиля в { -firefox-brand-name }, затем проанализируйте его и поделитесь им с помощью profiler.firefox.com.
Home--profile-firefox-android-instructions =
    Вы также можете профилировать { -firefox-android-brand-name }. Для получения
    дополнительной информации, пожалуйста, обратитесь к этой документации:
    <a>Профилирование { -firefox-android-brand-name } непосредственно на устройстве</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Этот экземпляр профайлера не смог подключиться к WebChannel, поэтому он не может активировать кнопку меню профайлера.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable =
    Этот экземпляр профайлера не смог подключиться к WebChannel. Обычно это означает, что
    он работает на другом хосте, отличном от того, который указан в настройках
    <code>devtools.performance.recording.ui-base-url</code>. Если вы хотите захватить новые
    профили с этим экземпляром и дать ему программный контроль над кнопкой меню профайлера,
    вы можете перейти к <code>about:config</code> и изменить настройку.
Home--record-instructions =
    Чтобы начать профилирование, нажмите кнопку профилирования или используйте горячие
    клавиши. Значок синий, когда профиль записывает.
    Нажмите <kbd>Запись</kbd>, чтобы загрузить данные на profiler.firefox.com.
Home--instructions-content =
    Для записи профилей производительности требуется <a>{ -firefox-brand-name }</a>.
    Однако существующие профили можно просматривать в любом современном браузере.
Home--record-instructions-start-stop = Остановить и начать профилирование
Home--record-instructions-capture-load = Запись и загрузка профиля
Home--profiler-motto = Запишите профиль производительности. Проанализируйте его. Поделитесь им. Сделайте Интернет быстрее.
Home--additional-content-title = Загрузить существующие профили
Home--additional-content-content = Вы можете <strong>перетащить</strong> сюда файл профиля, чтобы загрузить его, или:
Home--compare-recordings-info = Вы также можете сравнить записи. <a>Откройте интерфейс сравнения.</a>
Home--your-recent-uploaded-recordings-title = Ваши последние загруженные записи
Home--dark-mode-title = Тёмная тема
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } также может импортировать профили из других профилировщиков, таких как
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>,
    панель производительности Chrome, <androidstudio>Android Studio</androidstudio> или
    любой файл, использующий <dhat>формат dhat</dhat> или <traceevent>Формат отслеживания событий Google</traceevent>. <write>Узнайте, как написать
    собственный инструмент импорта</write>.
Home--install-chrome-extension = Установите расширение Chrome
Home--chrome-extension-instructions =
    Используйте <a>расширение { -profiler-brand-name } для Chrome</a>
    для сбора профилей производительности в Chrome и анализа их в
    { -profiler-brand-name }. Установите расширение из интернет-магазина Chrome.
Home--chrome-extension-recording-instructions =
    После установки используйте значок
    расширения на панели инструментов или сочетания клавиш для запуска и остановки профилирования. Вы также можете
    экспортировать профили и загрузить их здесь для подробного анализа.

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Введите условия фильтра

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Показывать только собственное время
    .title = Показывать только время, проведенное в узле вызова, игнорируя его дочерние элементы.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Щёлкните здесь, чтобы загрузить профиль { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Удалить
    .title = Этот профиль невозможно удалить, поскольку у нас нет информации для авторизации.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Профиль ещё не загружен!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Просматривайте и управляйте всеми своими записями (ещё { $profilesRestCount })
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Управление этой записью
        [few] Управление этими записями
       *[many] Управление этими записями
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Установить выделение из длительности маркера
MarkerContextMenu--start-selection-here = Начать выбор здесь
MarkerContextMenu--end-selection-here = Завершить выбор здесь
MarkerContextMenu--start-selection-at-marker-start = Начать выделение с <strong>начала</strong> маркера
MarkerContextMenu--start-selection-at-marker-end = Начать выделение с <strong>конца</strong> маркера
MarkerContextMenu--end-selection-at-marker-start = Завершить выделение в <strong>начале</strong> маркера
MarkerContextMenu--end-selection-at-marker-end = Завершить выделение в <strong>конце</strong> маркера
MarkerContextMenu--copy-description = Скопировать описание
MarkerContextMenu--copy-call-stack = Скопировать стек вызовов
MarkerContextMenu--copy-url = Скопировать URL
MarkerContextMenu--copy-page-url = Скопировать URL-адрес страницы
MarkerContextMenu--copy-as-json = Скопировать как JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Выберите цепочку получателя “<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Выберите цепочку отправителя «<strong>{ $threadName }</strong>».

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Отбрасывать семплы вне маркеров, соответствующих «<strong>{ $filter }</strong>».

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = Копировать таблицу маркеров как простой текст
MarkerCopyTableContextMenu--copy-table-as-markdown = Копировать таблицу маркеров как Markdown

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Маркеры фильтра:
    .title = Отображать только маркеры, совпадающие с определённым именем
MarkerSettings--marker-filters =
    .title = Фильтры маркеров
MarkerSettings--copy-table =
    .title = Копировать таблицу как текст
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = Число строк превышает лимит: { $rows } > { $maxRows }. Будут скопированы только первые { $maxRows } строк.

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Выберите маркер, чтобы отобразить информацию о нем.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Начать
MarkerTable--duration = Длительность
MarkerTable--name = Имя
MarkerTable--details = Подробности

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = Показать только подходящие маркеры: «{ $filter }»
    .aria-label = Показать только подходящие маркеры: «{ $filter }»

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Информация о профиле
MenuButtons--index--full-view = Полный обзор
MenuButtons--index--cancel-upload = Отменить выгрузку
MenuButtons--index--share-upload =
    .label = Выгрузить локальный профиль
MenuButtons--index--share-re-upload =
    .label = Повторно выгрузить
MenuButtons--index--share-error-uploading =
    .label = Ошибка выгрузки
MenuButtons--index--revert = Вернуться к исходному профилю
MenuButtons--index--docs = Документация
MenuButtons--permalink--button =
    .label = Постоянная ссылка

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Выгружено:
MenuButtons--index--profile-info-uploaded-actions = Удалить
MenuButtons--index--metaInfo-subtitle = Информация о профиле
MenuButtons--metaInfo--symbols = Символы:
MenuButtons--metaInfo--profile-symbolicated = Профиль символизирован
MenuButtons--metaInfo--profile-not-symbolicated = Профиль не символизирован
MenuButtons--metaInfo--resymbolicate-profile = Ресимволизировать профиль
MenuButtons--metaInfo--symbolicate-profile = Символизировать профиль
MenuButtons--metaInfo--attempting-resymbolicate = Попытка пересимволизировать профиль
MenuButtons--metaInfo--currently-symbolicating = Символизированный в настоящий момент профиль
MenuButtons--metaInfo--cpu-model = Модель процессора:
MenuButtons--metaInfo--cpu-cores = Ядер процессора:
MenuButtons--metaInfo--main-memory = Основная память:
MenuButtons--index--show-moreInfo-button = Показать больше
MenuButtons--index--hide-moreInfo-button = Показать меньше
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } физическое ядро, { $logicalCPUs } логическое ядро
                [few] { $physicalCPUs } физическое ядро, { $logicalCPUs } логических ядра
               *[many] { $physicalCPUs } физическое ядро, { $logicalCPUs } логических ядер
            }
        [few]
            { $logicalCPUs ->
                [one] { $physicalCPUs } физических ядра, { $logicalCPUs } логическое ядро
                [few] { $physicalCPUs } физических ядра, { $logicalCPUs } логических ядра
               *[many] { $physicalCPUs } физических ядра, { $logicalCPUs } логических ядер
            }
       *[many]
            { $logicalCPUs ->
                [one] { $physicalCPUs } физических ядер, { $logicalCPUs } логическое ядро
                [few] { $physicalCPUs } физических ядер, { $logicalCPUs } логических ядра
               *[many] { $physicalCPUs } физических ядер, { $logicalCPUs } логических ядер
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } физическое ядро
        [few] { $physicalCPUs } физических ядра
       *[many] { $physicalCPUs } физических ядер
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } логическое ядро
        [few] { $logicalCPUs } логических ядра
       *[many] { $logicalCPUs } логических ядер
    }
MenuButtons--metaInfo--profiling-started = Запись началась:
MenuButtons--metaInfo--profiling-session = Длина записи:
MenuButtons--metaInfo--main-process-started = Основной процесс запущен:
MenuButtons--metaInfo--main-process-ended = Основной процесс завершен:
MenuButtons--metaInfo--file-name = Имя файла:
MenuButtons--metaInfo--file-size = Размер файла:
MenuButtons--metaInfo--interval = Интервал:
MenuButtons--metaInfo--buffer-capacity = Емкость буфера:
MenuButtons--metaInfo--buffer-duration = Длительность буфера:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } секунда
        [few] { $configurationDuration } секунды
       *[many] { $configurationDuration } секунд
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Неограничена
MenuButtons--metaInfo--application = Приложение
MenuButtons--metaInfo--name-and-version = Имя и версия:
MenuButtons--metaInfo--application-uptime = Время работы:
MenuButtons--metaInfo--update-channel = Канал обновлений:
MenuButtons--metaInfo--build-id = ID сборки:
MenuButtons--metaInfo--build-type = Тип сборки:
MenuButtons--metaInfo--arguments = Параметры:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Отладка
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Платформа
MenuButtons--metaInfo--device = Устройство:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = ОС:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Визуальные метрики
MenuButtons--metaInfo--speed-index = Индекс скорости:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Индекс скорости восприятия:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Индекс скорости контента:
MenuButtons--metaInfo-renderRowOfList-label-features = Возможности:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Фильтр потоков:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Расширения:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Накладные расходы { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Середина
MenuButtons--metaOverheadStatistics-max = Максимум
MenuButtons--metaOverheadStatistics-min = Минимум
MenuButtons--metaOverheadStatistics-statkeys-overhead = Накладные расходы
    .title = Время для выборки всех потоков.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Очистка
    .title = Время для удаления просроченных данных.
MenuButtons--metaOverheadStatistics-statkeys-counter = Счётчики
    .title = Время на сбор всех счётчиков.
MenuButtons--metaOverheadStatistics-statkeys-interval = Интервал
    .title = Наблюдаемый интервал между двумя выборками.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Замки
    .title = Время для получения замка перед семплированием.
MenuButtons--metaOverheadStatistics-overhead-duration = Продолжительность накладных расходов:
MenuButtons--metaOverheadStatistics-overhead-percentage = Процент накладных расходов:
MenuButtons--metaOverheadStatistics-profiled-duration = Профилированная продолжительность:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Включая скрытые потоки
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Включая данные с других вкладок
MenuButtons--publish--renderCheckbox-label-hidden-time = Включая скрытый диапазон времени
MenuButtons--publish--renderCheckbox-label-include-screenshots = Включая скриншоты
MenuButtons--publish--renderCheckbox-label-resource = Включая URL-адреса ресурсов и пути
MenuButtons--publish--renderCheckbox-label-extension = Включая информацию о расширении
MenuButtons--publish--renderCheckbox-label-preference = Включая значения настроек
MenuButtons--publish--renderCheckbox-label-private-browsing = Включая данные из окон приватного просмотра
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Этот профиль содержит личные данные просмотра
MenuButtons--publish--reupload-performance-profile = Повторно загрузить профиль производительности
MenuButtons--publish--share-performance-profile = Поделиться профилем производительности
MenuButtons--publish--info-description = Загрузите свой профиль и сделайте его доступным для всех, у кого есть ссылка.
MenuButtons--publish--info-description-default = По умолчанию ваши личные данные удаляются.
MenuButtons--publish--info-description-firefox-nightly2 = Этот профиль принадлежит { -firefox-nightly-brand-name }, поэтому по умолчанию в него включена большая часть информации.
MenuButtons--publish--include-additional-data = Включая дополнительные данные, которые могут быть идентифицированы
MenuButtons--publish--button-upload = Выгрузить
MenuButtons--publish--upload-title = Выгрузка профиля…
MenuButtons--publish--cancel-upload = Отменить выгрузку
MenuButtons--publish--message-something-went-wrong = Ой, что-то пошло не так при загрузке профиля.
MenuButtons--publish--message-try-again = Попробовать снова
MenuButtons--publish--download = Скачать
MenuButtons--publish--compressing = Сжатие…
MenuButtons--publish--error-while-compressing = Ошибка при сжатии, попробуйте снять некоторые флажки, чтобы уменьшить размер профиля.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Сети фильтров:
    .title = Отображать только сетевые запросы, которые совпадают с конкретным именем

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

PanelSearch--search-field-hint = Знаете ли вы, что можно использовать запятую (,) для поиска по нескольким фильтрам?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Изменить имя профиля
ProfileName--edit-profile-name-input =
    .title = Изменить имя профиля
    .aria-label = Имя профиля

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Удалить
    .title = Нажмите сюда, чтобы удалить профиль { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = При удалении этого профиля произошла ошибка. <a>Наведите курсор, чтобы узнать больше.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Удалить { $profileName }
ProfileDeletePanel--dialog-confirmation-question =
    Вы уверены, что хотите удалить загруженные данные для этого профиля? Ссылки,
    которые ранее были общими, больше не будут работать.
ProfileDeletePanel--dialog-cancel-button =
    .value = Отмена
ProfileDeletePanel--dialog-delete-button =
    .value = Удалить
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Удаление…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Загруженные данные успешно удалены.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Полный диапазон ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Импорт и обработка профиля…
ProfileLoaderAnimation--loading-unpublished = Импорт профиля напрямую из { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Чтение файла и обработка профиля…
ProfileLoaderAnimation--loading-local = Пока не реализовано.
ProfileLoaderAnimation--loading-public = Скачивание и обработка профиля…
ProfileLoaderAnimation--loading-from-url = Скачивание и обработка профиля…
ProfileLoaderAnimation--loading-compare = Чтение и обработка профилей…
ProfileLoaderAnimation--loading-view-not-found = Вид не найден

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Вернуться на домашнюю страницу

## Root

Root--error-boundary-message =
    .message = Ой, какая-то неизвестная ошибка произошла в profiler.firefox.com.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Применение…
ServiceWorkerManager--pending-button = Применить и перезагрузить
ServiceWorkerManager--installed-button = Перезагрузить приложение
ServiceWorkerManager--updated-while-not-ready =
    Перед полной загрузки это страницы была применена новая
    версия приложения. Вы можете столкнуться с неисправностями.
ServiceWorkerManager--new-version-is-ready = Новая версия приложения скачана и готова к использованию.
ServiceWorkerManager--hide-notice-button =
    .title = Скрыть уведомление о перезагрузке
    .aria-label = Скрыть уведомление о перезагрузке

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-frames = Все фреймы
    .title = Не фильтровать стек фреймов
StackSettings--implementation-script = Скрипт
    .title = Показывать только фреймы стека, связанные с выполнением скрипта
StackSettings--implementation-native2 = Собственные
    .title = Отображать только стек фреймов для собственного кода
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Стеки фильтров:
StackSettings--use-data-source-label = Источник данных:
StackSettings--call-tree-strategy-timing = Тайминги
    .title = Суммировать, используя выборочные стеки выполняемого кода с течением времени
StackSettings--call-tree-strategy-js-allocations = Распределения JavaScript
    .title = Суммировать, используя выделенные байты JavaScript (без отмены выделения)
StackSettings--call-tree-strategy-native-retained-allocations = Сохранённая память
    .title = Суммировать, используя байты памяти, которые были выделены и никогда не освобождались при текущем выборе предварительного просмотра
StackSettings--call-tree-native-allocations = Выделенная память
    .title = Суммировать, используя выделенные байты памяти
StackSettings--call-tree-strategy-native-deallocations-memory = Освобожденная память
    .title = Суммировать, используя освобожденные байты памяти, по сайту, где была выделена память
StackSettings--call-tree-strategy-native-deallocations-sites = Сайты освобождения
    .title = Суммировать, используя байты освобожденной памяти, по сайту, где была освобождена память
StackSettings--invert-call-stack = Инвертировать стек вызовов
    .title = Сортировать по времени, потраченному на вызов узла, игнорируя его дочерние элементы.
StackSettings--show-user-timing = Показать время пользователя
StackSettings--use-stack-chart-same-widths = Использовать одинаковую ширину для всех стеков
StackSettings--panel-search =
    .label = Стеки фильтров:
    .title = Отображать только стеки, содержащие функции, имена которых совпадают с этой подстрокой

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Дерево вызовов
TabBar--flame-graph-tab = График сгорания
TabBar--stack-chart-tab = Диаграмма стека
TabBar--marker-chart-tab = Диаграмма маркеров
TabBar--marker-table-tab = Таблица маркеров
TabBar--network-tab = Сеть
TabBar--js-tracer-tab = JS-трассировщик

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Все вкладки и окна

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Показать только этот процесс
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Показать только «{ $trackName }»
TrackContextMenu--hide-other-screenshots-tracks = Скрыть другие треки скриншотов
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Скрыть «{ $trackName }»
TrackContextMenu--show-all-tracks = Показать все треки
TrackContextMenu--show-local-tracks-in-process = Показать все треки в этом процессе
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Скрыть все треки для типа «{ $type }»
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Показать все совпадающие треки
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Скрыть все совпадающие треки
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Не найдено результатов по запросу «<span>{ $searchFilter }</span>»
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Скрыть трек
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Скрыть процесс

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = относительная память в это время
TrackMemoryGraph--memory-range-in-graph = диапазон памяти на графике
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = размещения и освобождения с момента предыдущей выборки

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
    .label = Мощность
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } Вт
    .label = Мощность
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } мВт
    .label = Мощность
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } кВт
    .label = Средняя мощность при текущем выборе
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } Вт
    .label = Средняя мощность при текущем выборе
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } мВт
    .label = Средняя мощность при текущем выборе
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } кВт-ч ({ $carbonValue } кг CO₂e)
    .label = Энергия, использованная в видимом диапазоне
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Вт-ч ({ $carbonValue } г CO₂e)
    .label = Энергия, использованная в видимом диапазоне
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } мВт-ч ({ $carbonValue } мг CO₂e)
    .label = Энергия, используемая в видимом диапазоне
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } мкВт-ч ({ $carbonValue } мг CO₂e)
    .label = Энергия, использованная в видимом диапазоне
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } кВт-ч ({ $carbonValue } кг CO₂e)
    .label = Энергия, использованная в текущей выборке
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Вт-ч ({ $carbonValue } г CO₂e)
    .label = Энергия, использованная в текущей выборке
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } мВт-ч ({ $carbonValue } мг CO₂e)
    .label = Энергия, использованная в текущей выборке
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } мкВт-ч ({ $carbonValue } мг CO₂e)
    .label = Энергия, использованная в текущей выборке

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
TrackBandwidthGraph--speed = { $value } в секунду
    .label = Скорость передачи для этого семпла
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = операции чтения/записи с момента передачи предыдущего семпла
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } г CO₂e)
    .label = Данные, переданные до этого времени
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } г CO₂e)
    .label = Данные, передаваемые в видимом диапазоне
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } г CO₂e)
    .label = Данные, переданные в текущей выборке

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Введите условия фильтра
    .title = Отображать только треки, которые совпадают с конкретным текстом

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
TransformNavigator--complete = Завершить «{ $item }»
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Свернуть: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Узел фокусировки: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Фокус: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Фокусная категория: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Узел слияния: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Слияние: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Выпадание: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Свернуть рекурсию: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Свернуть только прямую рекурсию: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Свернуть поддерево: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Отбрасывать семплы за пределами совпадения маркеров: «{ $item }»

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Ожидание { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Ожидание { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Исходный код недоступен
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = См. <a>проблему #3741</a>, чтобы узнать о поддерживаемых сценариях и запланированных улучшениях.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Ассемблерный код недоступен
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = См. <a>проблему #4520</a>, чтобы узнать о поддерживаемых сценариях и запланированных улучшениях.
SourceView--close-button =
    .title = Закрыть исходный вид

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Для этого файла нет известного URL-адреса, доступного из разных источников.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Произошла сетевая ошибка при получении URL-адреса { $url }: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Не удалось запросить API символов браузера: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = API символов браузера вернул ошибку: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = API символов локального сервера символов вернул ошибку: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = API символов браузера вернул искаженный ответ: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = API символов локального сервера символов вернул искаженный ответ: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Файл { $pathInArchive } не найден в архиве из { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Архив по адресу { $url } не может быть проанализирован: { $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = Браузер не смог получить исходный файл для { $url } с sourceUuid { $sourceUuid }: { $errorMessage }.

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Показать вид сборки
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Скрыть вид сборки
# The "◀" button above the assembly view.
AssemblyView--prev-button =
    .title = Предыдущее
# The "▶" button above the assembly view.
AssemblyView--next-button =
    .title = Далее

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Загруженные записи
