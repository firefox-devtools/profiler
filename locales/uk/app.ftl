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


## AppViewRouter
## This is used for displaying errors when loading the application.


## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.


## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--form-label-profile1 = Профіль 1:
CompareHome--form-label-profile2 = Профіль 2:

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Відкрийте бічну панель
Details--close-sidebar-button =
    .title = Закрити бічну панель

## Footer Links

FooterLinks--legal = Правові положення
FooterLinks--Privacy = Приватність
FooterLinks--Cookies = Куки

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--categories = Категорії

## Home page

Home--upload-from-file-input-button = Завантажити профіль із файлу
Home--upload-from-url-button = Завантажити профіль з URL-адреси
Home--load-from-url-submit-button =
    .value = Завантажити
Home--documentation-button = Документація
Home--additional-content-title = Завантажити наявні профілі

## IdleSearchField
## The component that is used for all the search inputs in the application.


## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.


## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--copy-description = Копіювати опис
MarkerContextMenu--copy-url = Скопіювати URL-адресу

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--duration = Тривалість
MarkerTable--type = Тип
MarkerTable--description = Опис

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Інформація про профіль

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-actions = Видалити
MenuButtons--index--metaInfo-subtitle = Інформація про профіль
MenuButtons--metaInfo--symbols = Символи:
MenuButtons--metaInfo--interval = Інтервал:
MenuButtons--metaInfo--profile-version = Версія профілю:
MenuButtons--metaInfo--application = Застосунок
MenuButtons--metaInfo--name-and-version = Назва та версія:

## Strings refer to specific types of builds, and should be kept in English.


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
MenuButtons--publish--compressing = Стиснення

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


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

