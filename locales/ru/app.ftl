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

AppViewRouter--error-unpublished = Не удалось получить профиль из { -firefox-brand-name }.
AppViewRouter--error-from-file = Не удалось прочитать файл или проанализировать профиль в нем.
AppViewRouter--error-local = Пока не реализовано.
AppViewRouter--error-public = Не удалось загрузить профиль.
AppViewRouter--error-from-url = Не удалось загрузить профиль.
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
        Фокусировка на поддереве приведет к удалению любого сэмпла, который не включает эту
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
        Сворачивание функции приведет к удалению всего, что она вызвала, и назначению
        функции всего времени. Это может помочь упростить профиль, который
        вызывает код, не нуждающийся в анализе.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Свернуть <strong>{ $nameForResource }</strong>
    .title =
        Сворачивание ресурса сведет все вызовы к этому
        ресурсу в один свернутый узел вызова.
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

## CallTree
## This is the component for Call Tree panel.


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

CompareHome--form-label-profile1 = Профиль 1:
CompareHome--form-label-profile2 = Профиль 2:
CompareHome--submit-button =
    .value = Получить профили

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Открыть боковую панель
Details--close-sidebar-button =
    .title = Закрыть боковую панель

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Сообщите об ошибке на GitHub

## Footer Links

FooterLinks--legal = Юридическая информация
FooterLinks--Privacy = Приватность
FooterLinks--Cookies = Куки
FooterLinks--languageSwitcher--select =
    .title = Изменить язык

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.


## Home page

Home--upload-from-file-input-button = Загрузить профиль из файла
Home--upload-from-url-button = Загрузить профиль из URL-адреса
Home--load-from-url-submit-button =
    .value = Загрузить
Home--documentation-button = Документация
Home--menu-button = Включить кнопку меню { -profiler-brand-name }
Home--record-instructions-start-stop = Остановить и начать профилирование
Home--record-instructions-capture-load = Запись и загрузка профиля
Home--profiler-motto = Запишите профиль производительности. Проанализируйте его. Поделитесь им. Сделайте Интернет быстрее.
Home--additional-content-title = Загрузить существующие профили

## IdleSearchField
## The component that is used for all the search inputs in the application.


## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Щёлкните здесь, чтобы загрузить профиль { $smallProfileName }
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Профиль ещё не загружен!

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--copy-description = Скопировать описание
MarkerContextMenu--copy-call-stack = Скопировать стек вызовов
MarkerContextMenu--copy-url = Скопировать URL
MarkerContextMenu--copy-page-url = Скопировать URL-адрес страницы
MarkerContextMenu--copy-as-json = Скопировать как JSON

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Начать
MarkerTable--duration = Длительность
MarkerTable--type = Тип
MarkerTable--description = Описание

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Информация о профиле
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
MenuButtons--metaInfo--cpu-model = Модель процессора:
MenuButtons--metaInfo--cpu-cores = Ядер процессора:
MenuButtons--metaInfo--main-memory = Основная память:
MenuButtons--index--show-moreInfo-button = Показать больше
MenuButtons--index--hide-moreInfo-button = Показать меньше
MenuButtons--metaInfo--main-process-started = Основной процесс запущен:
MenuButtons--metaInfo--main-process-ended = Основной процесс завершен:
MenuButtons--metaInfo--interval = Интервал:
MenuButtons--metaInfo--buffer-capacity = Емкость буфера:
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Неограничена
MenuButtons--metaInfo--application = Приложение
MenuButtons--metaInfo--name-and-version = Имя и версия:
MenuButtons--metaInfo--update-channel = Канал обновлений:
MenuButtons--metaInfo--build-id = ID сборки:
MenuButtons--metaInfo--build-type = Тип сборки:
MenuButtons--metaInfo--arguments = Параметры:

## Strings refer to specific types of builds, and should be kept in English.


##

MenuButtons--metaInfo--platform = Платформа
MenuButtons--metaInfo--device = Устройство:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = ОС:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Визуальные метрики
MenuButtons--metaInfo--speed-index = Индекс скорости:
MenuButtons--metaInfo-renderRowOfList-label-features = Возможности:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Расширения:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.


## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--button-upload = Выгрузить
MenuButtons--publish--upload-title = Выгрузка профиля…
MenuButtons--publish--cancel-upload = Отменить выгрузку
MenuButtons--publish--message-try-again = Попробовать снова
MenuButtons--publish--download = Загрузить
MenuButtons--publish--compressing = Сжатие…

## NetworkSettings
## This is used in the network chart.


## Timestamp formatting primitive


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Удалить { $profileName }
ProfileDeletePanel--dialog-cancel-button =
    .value = Отмена
ProfileDeletePanel--dialog-delete-button =
    .value = Удалить
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Удаление…

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.


## Profile Loader Animation

ProfileLoaderAnimation--loading-local = Пока не реализовано.
ProfileLoaderAnimation--loading-public = Загрузка и обработка профиля…
ProfileLoaderAnimation--loading-from-url = Загрузка и обработка профиля…
ProfileLoaderAnimation--loading-compare = Чтение и обработка профилей…

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }

## Root


## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Применение…
ServiceWorkerManager--pending-button = Применить и перезагрузить
ServiceWorkerManager--installed-button = Перезагрузить приложение

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--use-data-source-label = Источник данных:

## Tab Bar for the bottom half of the analysis UI.


## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Скрыть «{ $trackName }»

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


## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.


## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.


## Toggle buttons in the top right corner of the bottom box


## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

