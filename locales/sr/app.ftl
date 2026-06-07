# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox за Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> - <subheader>Веб-програм за анализу перформанси { -firefox-brand-name }-а</subheader>
AppHeader--github-icon =
    .title = Идите на нашу Git ризницу (ово се отвара у новом прозору)

## ThemeToggle
## They are used at the top right side of the home page to switch between themes.

ThemeToggle--system =
    .title = Прати подешавање теме система
ThemeToggle--light =
    .title = Користи светлу тему
ThemeToggle--dark =
    .title = Користи тамну тему

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Није било могуће увести профил.
AppViewRouter--error-unpublished = Није било могуће преузети профил из { -firefox-brand-name }-а.
AppViewRouter--error-from-file = Није било могуће прочитати датотеку или рашчланити профил у њој.
AppViewRouter--error-local = Још увек није израђено.
AppViewRouter--error-public = Није било могуће преузети профил.
AppViewRouter--error-from-url = Није било могуће преузети профил.
AppViewRouter--error-compare = Није било могуће преузети профиле.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    Због <a>одређеног ограничења у Safari-ју</a>, { -profiler-brand-name } не може
    да увезе профиле са локалне машине у овом прегледачу. Уместо тога, отворите
    ову страницу у { -firefox-brand-name }-у или Chrome-у.
    .title = Safari не може да увезе локалне профиле
AppViewRouter--route-not-found--home =
    .specialMessage = URL адреса коју сте покушали да посетите није препозната.

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (уграђено)
    .title = { $function } је уграђена у позивача од стране компилера.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Прикажи <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Споји функцију
    .title =
        Спајањем функције она се уклања из профила, а њено време се додељује функцији
        која је позивала. Ово се дешава свуда где је функција била позивана у
        стаблу.
CallNodeContextMenu--transform-merge-call-node = Споји само чвор
    .title =
        Спајањем чвора он се уклања из профила, а њено време се додељује чвору функције
        која је позивала. Он само уклања функцију из тог специфичног дела
        стабла. Сва остала места са којих је функција била позивана
        остаће у профилу.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Фокусирање на функцију уклониће сваки узорак који не укључује ту
    функцију. Поред тога, поново поставља корен стабла позива тако да та функција
    постане једини корен стабла. Ово може комбиновати вишеструка места позива функције
    у целом профилу у један чвор позива.
CallNodeContextMenu--transform-focus-function = Фокусирајте се на функцију
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Фокусирајте се на функцију (обрнуто)
    .title = { CallNodeContextMenu--transform-focus-function-title }

## The translation for "self" in these strings should match the translation used
## in CallTree--samples-self and CallTree--bytes-self. Alternatively it can be
## translated as "self values" or "self time" (though "self time" is less desirable
## because this menu item is also shown in "bytes" mode).

CallNodeContextMenu--transform-focus-self-title =
    Фокусирање на себе слично је фокусирању на функцију, али задржава само узорке
    који доприносе сопственом времену функције. Узорци у позиваним функцијама
    се одбацују, а стабло позива се поново укорењује на фокусирану функцију.
CallNodeContextMenu--transform-focus-self = Фокусирајте се само на себе
    .title = { CallNodeContextMenu--transform-focus-self-title }

##

CallNodeContextMenu--transform-focus-subtree = Фокусирајте се само на подстабло
    .title =
        Фокусирање на подстабло уклониће сваки узорак који не укључује тај
        специфични део стабла позива. Издваја грану стабла позива,
        међутим, чини то само за тај једини чвор позива. Сви остали позиви
        функције се занемарују.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Фокусирајте се на категорију <strong>{ $categoryName }</strong>
    .title =
        Фокусирање на чворове који припадају истој категорији као и означени чвор,
        чиме се спајају сви чворови који припадају другој категорији.
CallNodeContextMenu--transform-collapse-function-subtree = Скупи функцију
    .title =
        Скупљањем функције уклониће се све што је она позивала, а све време ће
        се доделити тој функцији. Ово може помоћи у поједностављивању профила
        који позива код који не мора да се анализира.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Скупи <strong>{ $nameForResource }</strong>
    .title =
        Скупљањем ресурса сви позиви тог ресурса ће се изравнати
        у један скупљени чвор позива.
CallNodeContextMenu--transform-collapse-recursion = Скупи рекурзију
    .title =
        Скупљањем рекурзије уклањају се позиви који се понављају рекурзивно у
        исту функцију, чак и са посредничким функцијама на стеку.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Скупи само директну рекурзију
    .title = Скупљање директне рекурзије уклања позиве који се понављано рекурсивно позивају у исту функцију без посредничких функција на стеку.
CallNodeContextMenu--transform-drop-function = Одбаци узорке са овом функцијом
    .title = Одбацивање узорака уклања њихово време из профила. Ово је корисно како би се елиминисали подаци о времену који нису релевантни за анализу.
CallNodeContextMenu--expand-all = Рашири све
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Потражите назив функције на Searchfox-у
CallNodeContextMenu--copy-function-name = Копирај назив функције
CallNodeContextMenu--copy-script-url = Копирај URL скрипте
CallNodeContextMenu--copy-stack = Копирај стек
CallNodeContextMenu--show-the-function-in-devtools = Прикажи функцију у DevTools-у

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Време извршавања (мс)
    .title = „Укупно“ време извршавања укључује сажетак свог времена током којег је ова функција забележена на стеку. То укључује време током које је функција заиста радила, као и време потрошено у позивачима ове функције.
CallTree--tracing-ms-self = Своје (мс)
    .title = „Своје“ време укључује само време током којег је функција била на крају стека. Ако је ова функција позивала друге функције, онда се време тих „других“ функција не укључује. „Своје“ време је корисно за разумевање где је време заиста потрошено у програму.
CallTree--samples-total = Укупно (узорци)
    .title = „Укупно“ број узорака укључује сажетак сваког узорка током којег је ова функција забележена на стеку. То укључује време током које је функција заиста радила, као и време потрошено у позивачима ове функције.
CallTree--samples-self = Своје
    .title = „Свој“ број узорака укључује само узорке током којих је функција била на крају стека. Ако је ова функција позивала друге функције, онда се број узорака тих „других“ функција не укључује. „Свој“ број узорака је користан за разумевање где је време заиста потрошено у програму.
CallTree--bytes-total = Укупна величина (бајтови)
    .title = „Укупна величина“ укључује сажетак свих бајтова који су додељени или ослобођени док је ова функција забележена на стеку. То укључује и бајтове током које је функција заиста радила, као и бајтове позивача ове функције.
CallTree--bytes-self = Своје (бајтови)
    .title = „Своји“ бајтови укључују бајтове који су додељени или ослобођени док је ова функција била на крају стека. Ако је ова функција позивала друге функције, онда се бајтови тих „других“ функција не укључују. „Своји“ бајтови су корисни за разумевање где је меморија заиста додељена или ослобођена у програму.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Неки позиви функције { $calledFunction } су уграђени од стране компилера.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (уграђено)
    .title = Позиви функције { $calledFunction } су уграђени у { $outerFunction } од стране компилера.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Изаберите чвор да бисте приказали податке о њему.
CallTreeSidebar--call-node-details = Детаљи чвора позива

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
    .label = Забележено време извршавања
CallTreeSidebar--traced-self-time =
    .label = Забележено своје време
CallTreeSidebar--running-time =
    .label = Време извршавања
CallTreeSidebar--self-time =
    .label = Своје време
CallTreeSidebar--running-samples =
    .label = Узорци извршавања
CallTreeSidebar--self-samples =
    .label = Своји узорци
CallTreeSidebar--running-size =
    .label = Величина извршавања
CallTreeSidebar--self-size =
    .label = Своја величина
CallTreeSidebar--categories = Категорије
CallTreeSidebar--implementation = Израда
CallTreeSidebar--running-milliseconds = Милисекунде извршавања
CallTreeSidebar--running-sample-count = Број узорака извршавања
CallTreeSidebar--running-bytes = Бајтови извршавања
CallTreeSidebar--self-milliseconds = Своје милисекунде
CallTreeSidebar--self-sample-count = Свој број узорака
CallTreeSidebar--self-bytes = Своји бајтови

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Унесите URL-ове профила које желите да упоредите
CompareHome--instruction-content = Алат ће извући податке из изабраног трака и опсега за сваки профил и поставити их обоје у исти преглед како би их било лако упоредити.
CompareHome--form-label-profile1 = Профил 1:
CompareHome--form-label-profile2 = Профил 2:
CompareHome--submit-button =
    .value = Преузми профиле

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Овај профил је снимљен у изградњи без оптимизација за издање.
        Наблюдања перформанси се можда не односе на популацију издања.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Отвори страничник
Details--close-sidebar-button =
    .title = Затвори страничник
Details--error-boundary-message =
    .message = Ух, нека непозната грешка се догодила у овој површи.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description = Пријавите овај проблем програмерима, укључујући и пуну грешку као што је приказано у веб-конзоли алата за програмере.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Пријавите грешку на GitHub-у

## Settings Menu
## The settings popup opened from the cog icon in the top bar.

SettingsMenu--button =
    .title = Подешавања
SettingsMenu--docs = Документација
SettingsMenu--legal = Права
SettingsMenu--privacy = Приватност
SettingsMenu--cookies = Колачићи
SettingsMenu--language-switcher =
    .title = Промени језик

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> стазе

## Home page

Home--upload-from-file-input-button = Учитај профил из датотеке
Home--upload-from-url-button = Учитај профил са URL-а
Home--load-from-url-submit-button =
    .value = Учитај
Home--documentation-button = Документација
Home--menu-button = Омогући дугме менија { -profiler-brand-name }
Home--menu-button-instructions =
    Омогућите дугме менија за профајлер да бисте покренули снимање профила перформанси
    у { -firefox-brand-name }, затим га анализирајте и поделите га на profiler.firefox.com.
Home--profile-firefox-android-instructions =
    Такође можете профилисати { -firefox-android-brand-name }. За више
    информација, погледајте ову документацију:
    <a>Профилисање { -firefox-android-brand-name } директно на уређају</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Овај примерак профајлера није успео да се повеже са WebChannel-ом, па не може да омогући дугме менија за профајлер.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable =
    Овај примерак профајлера није успео да се повеже са WebChannel-ом. То обично значи да се он извршава на другом хосту од онога који је наведен у подешавању
    <code>devtools.performance.recording.ui-base-url</code>. Ако желите да ухватите нове
    профиле помоћу овог примерка и да му омогућИТЕ програмско управљање дугметом менија за профајлер,
    можете да одете на <code>about:config</code> и промените подешавање.
Home--record-instructions =
    Да бисте покренули профилисање, кликните на дугме за профилисање или употребите
    тастатурне пречице. Иконица је плава када је снимање профила у току.
    Притисните <kbd>Ухвати</kbd> да бисте учитали податке на profiler.firefox.com.
Home--instructions-content2 =
    Снимање профила перформанси захтева <a>{ -firefox-brand-name } за стони рачунар</a>.
    Међутим, постојећи профили се могу видети у било ком савременом прегледачу.
Home--fenix-instructions-directly =
    { -firefox-android-brand-name } се може профилисати директно на овом уређају. За више
    информација, прочитајте <a>Профилисање { -firefox-android-brand-name } директно на уређају</a>.
Home--fenix-instructions-remotely =
    Такође можете профилисати { -firefox-android-brand-name } на удаљењу помоћу { -firefox-brand-name }
    за стони рачунар. За више информација, погледајте ову документацију:
    <a>Профилисање { -firefox-android-brand-name } на удаљењу</a>.
Home--record-instructions-start-stop = Заустави и покрени профилисање
Home--record-instructions-capture-load = Ухвати и учитај профил
Home--profiler-motto = Ухвати профил перформанси. Анализирај га. Подели га. Убрзај веб.
Home--additional-content-title = Учитај постојеће профиле
Home--additional-content-content = Можете <strong>превући и испустити</strong> датотеку профила овде да бисте је учитали, или:
Home--compare-recordings-info = Такође можете да упоредите снимке. <a>Отворите прочеље за поређење.</a>
Home--your-recent-uploaded-recordings-title = Ваши недавно послати снимци
Home--dark-mode-title = Тамни режим
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } такође може да увезе профиле из других профајлера, као што су
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>, Chrome-ова површ за перформансе,
    <androidstudio>Android Studio</androidstudio>, или било која датотека која користи <dhat>dhat формат</dhat>
    или <traceevent>Google-ов Trace Event формат</traceevent>. <write>Сазнајте како да напишете сопствени увозник</write>.
Home--install-chrome-extension = Инсталирај Chrome-ов додатак
Home--chrome-extension-instructions =
    Употребите <a>{ -profiler-brand-name } додатак за Chrome</a>
    да бисте ухватили профиле перформанси у Chrome-у и анализирали их у
    { -profiler-brand-name }. Инсталирајте додатак са Chrome Web Store-а.
Home--chrome-extension-recording-instructions = Када га инсталирате, употребите иконицу додатка на алатној траци или пречице да бисте покренули и зауставили профилисање. Такође можете да извезете профиле и учитате их овде за детаљну анализу.

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Унесите појмове за филтрирање

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Прикажи само сопствено време
    .title = Прикажи само време потрошено у чвору позива, занемарујући његове потомке.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Кликните овде да бисте учитали профил { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Обриши
    .title = Овај профил не може бити обрисан јер нам недостају подаци о овлашћењу.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Још увек није послат ниједан профил!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Погледајте и управљајте свим својим снимцима ({ $profilesRestCount } више)
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Управљај овим снимком
        [few] Управљај овим снимцима
       *[other] Управљај овим снимцима
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Постави избор на основу трајања обележивача
MarkerContextMenu--start-selection-here = Почни избор овде
MarkerContextMenu--end-selection-here = Заврши избор овде
MarkerContextMenu--start-selection-at-marker-start = Почни избор на <strong>почетку</strong> обележивача
MarkerContextMenu--start-selection-at-marker-end = Почни избор на <strong>крају</strong> обележивача
MarkerContextMenu--end-selection-at-marker-start = Заврши избор на <strong>почетку</strong> обележивача
MarkerContextMenu--end-selection-at-marker-end = Заврши избор на <strong>крају</strong> обележивача
MarkerContextMenu--copy-description = Копирај опис
MarkerContextMenu--copy-call-stack = Копирај стек позива
MarkerContextMenu--copy-url = Копирај URL
MarkerContextMenu--copy-page-url = Копирај URL стране
MarkerContextMenu--copy-as-json = Копирај као JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Изабери примајућу нит „<strong>{ $threadName }</strong>“
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Изабери пошаљиљућу нит „<strong>{ $threadName }</strong>“

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Испусти узорке изван обележивача који одговарају тексту „<strong>{ $filter }</strong>“

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = Копирај табелу обележивача као обичан текст
MarkerCopyTableContextMenu--copy-table-as-markdown = Копирај табелу обележивача као Markdown

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Филтруј обележиваче:
    .title = Приказујте само обележиваче који одговарају одређеном називу
MarkerSettings--marker-filters =
    .title = Филтери обележивача
MarkerSettings--copy-table =
    .title = Копирај табелу као текст
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = Број редова прелази ограничење: { $rows } > { $maxRows }. Копираће се само првих { $maxRows } редова.

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Изаберите обележивач да бисте приказали податке о њему.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Покрени
MarkerTable--duration = Трајање
MarkerTable--name = Назив
MarkerTable--details = Детаљи

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = Прикажи само обележиваче који одговарају тексту: „{ $filter }“
    .aria-label = Прикажи само обележиваче који одговарају тексту: „{ $filter }“

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Подаци о профилу
MenuButtons--index--full-view = Пун преглед
MenuButtons--index--cancel-upload = Откажи отпремање
MenuButtons--index--share-upload =
    .label = Отпреми локални профил
MenuButtons--index--share-re-upload =
    .label = Поново отпреми
MenuButtons--index--share-error-uploading =
    .label = Грешка при отпремању
MenuButtons--index--revert = Врати на почетни профил
MenuButtons--permalink--button =
    .label = Трајна веза

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Отпремљено:
MenuButtons--index--profile-info-uploaded-actions = Обриши
MenuButtons--index--metaInfo-subtitle = Информације о профилу
MenuButtons--metaInfo--symbols = Симболи:
MenuButtons--metaInfo--profile-symbolicated = Профил је симболизован
MenuButtons--metaInfo--profile-not-symbolicated = Профил није симболизован
MenuButtons--metaInfo--resymbolicate-profile = Поново симболизујте профил
MenuButtons--metaInfo--symbolicate-profile = Симболизујте профил
MenuButtons--metaInfo--attempting-resymbolicate = Покушавање поновног симболизовања профила
MenuButtons--metaInfo--currently-symbolicating = У току је симболизовање профила
MenuButtons--metaInfo--cpu-model = Модел процесора:
MenuButtons--metaInfo--cpu-cores = Језгра процесора:
MenuButtons--metaInfo--main-memory = Главна меморија:
MenuButtons--index--show-moreInfo-button = Прикажи више
MenuButtons--index--hide-moreInfo-button = Прикажи мање
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } физичко језгро, { $logicalCPUs } логичко језгро
                [few] { $physicalCPUs } физичко језгро, { $logicalCPUs } логичка језгра
               *[other] { $physicalCPUs } физичко језгро, { $logicalCPUs } логичка језгра
            }
        [few]
            { $logicalCPUs ->
                [one] { $physicalCPUs } физичка језгра, { $logicalCPUs } логичко језгро
                [few] { $physicalCPUs } физичка језгра, { $logicalCPUs } логичка језгра
               *[other] { $physicalCPUs } физичка језгра, { $logicalCPUs } логичка језгра
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } физичка језгра, { $logicalCPUs } логичко језгро
                [few] { $physicalCPUs } физичка језгра, { $logicalCPUs } логичка језгра
               *[other] { $physicalCPUs } физичка језгра, { $logicalCPUs } логичка језгра
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } физичко језгро
        [few] { $physicalCPUs } физичка језгра
       *[other] { $physicalCPUs } физичка језгра
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } логичко језгро
        [few] { $logicalCPUs } логичка језгра
       *[other] { $logicalCPUs } логичка језгра
    }
MenuButtons--metaInfo--profiling-started = Снимање је започето:
MenuButtons--metaInfo--profiling-session = Дужина снимања:
MenuButtons--metaInfo--main-process-started = Главни процес је започео:
MenuButtons--metaInfo--main-process-ended = Главни процес је завршен:
MenuButtons--metaInfo--file-name = Назив датотеке:
MenuButtons--metaInfo--file-size = Величина датотеке:
MenuButtons--metaInfo--interval = Период:
MenuButtons--metaInfo--buffer-capacity = Капацитет спремишта:
MenuButtons--metaInfo--buffer-duration = Трајање спремишта:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } секунда
        [few] { $configurationDuration } секунде
       *[other] { $configurationDuration } секунда
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Неограничено
MenuButtons--metaInfo--application = Програм
MenuButtons--metaInfo--name-and-version = Назив и издање:
# The time between application startup and when the profiler was started
MenuButtons--metaInfo--application-uptime2 = Време рада:
MenuButtons--metaInfo--update-channel = Канал надоградње:
MenuButtons--metaInfo--build-id = ИД издања:
MenuButtons--metaInfo--build-type = Врста издања:
MenuButtons--metaInfo--arguments = Аргументи:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Отклањање грешака
MenuButtons--metaInfo--build-type-opt = Оптимизовано

##

MenuButtons--metaInfo--platform = Платформа
MenuButtons--metaInfo--device = Уређај:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = ОС:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = АБИ:
MenuButtons--metaInfo--visual-metrics = Визуелне метрике
MenuButtons--metaInfo--speed-index = Индекс брзине:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Perceptual индекс брзине:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Contentful индекс брзине:
MenuButtons--metaInfo-renderRowOfList-label-features = Могућности:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Филтер нити:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Додаци:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Оптерећење { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Средња вредност
MenuButtons--metaOverheadStatistics-max = Највише
MenuButtons--metaOverheadStatistics-min = Најмање
MenuButtons--metaOverheadStatistics-statkeys-overhead = Оптерећење
    .title = Време за узорковање свих нити.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Чишћење
    .title = Време за одбацивање истеклих подака.
MenuButtons--metaOverheadStatistics-statkeys-counter = Бројач
    .title = Време за прикупљање свих бројача.
MenuButtons--metaOverheadStatistics-statkeys-interval = Период
    .title = Примећени период између два узорка.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Закључавања
    .title = Време за добијање закључавања пре узорковања.
MenuButtons--metaOverheadStatistics-overhead-duration = Трајања оптерећења:
MenuButtons--metaOverheadStatistics-overhead-percentage = Проценат оптерећења:
MenuButtons--metaOverheadStatistics-profiled-duration = Трајање профилисања:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Укључи сакривене нити
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Укључи податке из других језикаца
MenuButtons--publish--renderCheckbox-label-hidden-time = Укључи сакривен временски опсег
MenuButtons--publish--renderCheckbox-label-include-screenshots = Укључи снимке екрана
MenuButtons--publish--renderCheckbox-label-resource = Укључи URL-ове и путање ресурса
MenuButtons--publish--renderCheckbox-label-extension = Укључи податке о додацима
MenuButtons--publish--renderCheckbox-label-preference = Укључи вредности подешавања
MenuButtons--publish--renderCheckbox-label-private-browsing = Укључи податке из прозора за приватно прегледање
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Овај профил садржи податке за приватно прегледање
MenuButtons--publish--reupload-performance-profile = Поново отпреми профил перформанси
MenuButtons--publish--share-performance-profile = Подели профил перформанси
MenuButtons--publish--info-description = Отпремите ваш профил и учините га приступачним свима који имају везу.
MenuButtons--publish--info-description-default = Подразумевано, ваши лични подаци се уклањају.
MenuButtons--publish--info-description-firefox-nightly2 = Овај профил је из { -firefox-nightly-brand-name }, па је подразумевано већина података укључена.
MenuButtons--publish--include-additional-data = Укључи додатне податке који могу бити идентификовани
MenuButtons--publish--button-upload = Отпреми
MenuButtons--publish--upload-title = Отпремање профила…
MenuButtons--publish--cancel-upload = Откажи отпремање
MenuButtons--publish--message-something-went-wrong = Ух, нешто је пошло по злу при отпремању профила.
MenuButtons--publish--message-try-again = Покушајте поново
MenuButtons--publish--download = Преузми
MenuButtons--publish--compressing = Сажимање…
MenuButtons--publish--error-while-compressing = Грешка при сажимању, покушајте да одзначите неке од поља како бисте смањили величину профила.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Филтрирај мреже:
    .title = Прикажи само мрежне захтеве који одговарају одређеном називу

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

PanelSearch--search-field-hint = Да ли сте знали да можете да користите зарез (,) за претрагу помоћу више појмова?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Уреди назив профила
ProfileName--edit-profile-name-input =
    .title = Уреди назив профила
    .aria-label = Назив профила

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Обриши
    .title = Кликните овде да обришете профил { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Дошло је до грешке при брисању овог профила. <a>Померите мишем за више података.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Обриши { $profileName }
ProfileDeletePanel--dialog-confirmation-question =
    Да ли сте сигурни да желите да обришете отпремљене податке за овај профил? Везе
    које су претходно делене више неће радити.
ProfileDeletePanel--dialog-cancel-button =
    .value = Откажи
ProfileDeletePanel--dialog-delete-button =
    .value = Обриши
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Брисање…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Послати подаци су успешно обрисани.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Цео опсег ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Увозим и обрађујем профил…
ProfileLoaderAnimation--loading-unpublished = Увозим профил директно из { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Читам датотеку и обрађујем профил…
ProfileLoaderAnimation--loading-local = Још увек није израђено.
ProfileLoaderAnimation--loading-public = Преузимам и обрађујем профил…
ProfileLoaderAnimation--loading-from-url = Преузимам и обрађујем профил…
ProfileLoaderAnimation--loading-compare = Читам и обрађујем профиле…
ProfileLoaderAnimation--loading-view-not-found = Преглед није пронађен

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Назад на почетну

## Root

Root--error-boundary-message =
    .message = Ух! Дошло је до неке непознате грешке на profiler.firefox.com.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Примењујем…
ServiceWorkerManager--pending-button = Примени и поново учитај
ServiceWorkerManager--installed-button = Поново учитај програм
ServiceWorkerManager--updated-while-not-ready =
    Ново издање програма је примењено пре него што је ова страница
    у потпуности учитана. Можда ћете приметити проблеме у раду.
ServiceWorkerManager--new-version-is-ready = Ново издање програма је преузето и спремно за употребу.
ServiceWorkerManager--hide-notice-button =
    .title = Сакриј обавештење о поновном учитавању
    .aria-label = Сакриј обавештење о поновном учитавању

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-frames = Сви кадрови
    .title = Не филтрирајте кадрове стека
StackSettings--implementation-script = Скрипта
    .title = Прикажите само кадрове стека повезане са извршавањем скрипте
StackSettings--implementation-native2 = Изворни
    .title = Прикажите само кадрове стека за изворни код
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Филтрирајте стекове:
StackSettings--use-data-source-label = Извор података:
StackSettings--call-tree-strategy-timing = Времена
    .title = Сумирајте помоћу узоркованих стекова извршеног кода током времена
StackSettings--call-tree-strategy-js-allocations = JavaScript алокације
    .title = Сумирајте помоћу бајтова алоцираног JavaScript-а (без деалокација)
StackSettings--call-tree-strategy-native-retained-allocations = Задржана меморија
    .title = Сумирајте помоћу бајтова меморије који су алоцирани и никада ослобођени у тренутном избору претпрегледа
StackSettings--call-tree-native-allocations = Алоцирана меморија
    .title = Сумирајте помоћу бајтова алоциране меморије
StackSettings--call-tree-strategy-native-deallocations-memory = Ослобођена меморија
    .title = Сумирајте помоћу бајтова ослобођене меморије, према месту где је меморија алоцирана
StackSettings--call-tree-strategy-native-deallocations-sites = Места ослобађања
    .title = Сумирајте помоћу бајтова ослобођене меморије, према месту где је меморија ослобођена
StackSettings--invert-call-stack = Обрни стек позива
    .title = Поређајте по времену потрошеном у чвору позива, игноришући његове потомке.
StackSettings--include-idle-samples = Укључите узорке мировања
    .title = Понистите ознаку да бисте сакрили узорке чији је крајњи кадар у категорији мировања.
StackSettings--show-user-timing = Прикажите корисничка времена
StackSettings--use-stack-chart-same-widths = Користите исту ширину за сваки стек
StackSettings--panel-search =
    .label = Филтрирајте стекове:
    .title = Прикажите само стекове који садрже функцију чији се назив подудара са овом подниском

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Стабло позива
TabBar--flame-graph-tab = Пламени график
TabBar--stack-chart-tab = График стека
TabBar--marker-chart-tab = График обележивача
TabBar--marker-table-tab = Табела обележивача
TabBar--network-tab = Мрежа
TabBar--js-tracer-tab = JS трагач

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Сви језичци и прозори

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Прикажите само овај процес
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Прикажите само „{ $trackName }“
TrackContextMenu--hide-other-screenshots-tracks = Сакриј остале стазе снимака екрана
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Сакриј „{ $trackName }“
TrackContextMenu--show-all-tracks = Прикажи све стазе
TrackContextMenu--show-local-tracks-in-process = Прикажи све стазе у овом процесу
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Сакриј све стазе врсте „{ $type }“
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Прикажи све стазе које одговарају
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Сакриј све стазе које одговарају
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Није пронађен ниједан резултат за „<span>{ $searchFilter }</span>“
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Сакриј стазу
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Сакриј процес

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

# Variables:
#   $value (String) - the relative memory at this time (e.g. "5MB")
TrackMemoryGraph--relative-memory-at-this-time2 = { $value }
    .label = релативна меморија у овом тренутку
# Variables:
#   $value (String) - the memory range across the graph (e.g. "5MB")
TrackMemoryGraph--memory-range-in-graph2 = { $value }
    .label = опсег меморије на графику
# Variables:
#   $value (String) - count of allocations and deallocations since the previous sample
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample2 = { $value }
    .label = алокације и деалокације од претходног узорка

## TrackProcessCPUGraph
## This is used to show the CPU usage of a process over time in the timeline.

# Variables:
#   $value (String) - the CPU usage at this sample (e.g. "50%")
TrackProcessCPUGraph--cpu = { $value }
    .label = CPU

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
TrackPower--tooltip-power-kilowatt = { $value } kW
    .label = Снага
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Снага
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Снага
# This is used in the tooltip when the instant power value uses the microwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-microwatt = { $value } μW
    .label = Снага
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Просечна снага у тренутном избору
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Просечна снага у тренутном избору
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Просечна снага у тренутном избору
# This is used in the tooltip when the power value uses the microwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-microwatt = { $value } μW
    .label = Просечна снага у тренутном избору
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Енергија потрошена у видљивом опсегу
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Енергија потрошена у видљивом опсегу
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Енергија потрошена у видљивом опсегу
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Енергија потрошена у видљивом опсегу
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Енергија потрошена у тренутном избору
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Енергија потрошена у тренутном избору
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Енергија потрошена у тренутном избору
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Енергија потрошена у тренутном избору

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
TrackBandwidthGraph--speed = { $value } по секунди
    .label = Брзина преноса за овај узорак
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = операције читања/писања од претходног узорка
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Подаци пренешени до овог тренутка
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Подаци пренешени у видљивом опсегу
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = Подаци пренешени у тренутном избору

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Унесите појмове за филтрирање
    .title = Прикажите само стазе које одговарају одређеном тексту

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
TransformNavigator--complete = Потпун „{ $item }“
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Скупљање: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Фокусирање чвора: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Фокусирање: { $item }
# "Focus self" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-on-function-self
# Also see the translation note above CallNodeContextMenu--transform-focus-self.
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-self = Фокусирање на себе: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Фокусирана категорија: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Спајање чвора: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Спајање: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Уклањање: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Скупљање рекурзије: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Скупљање само директне рекурзије: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Скупљање подстабла: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Уклањање узорака ван обележивача који одговарају: „{ $item }“

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Чека се { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Чека се { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Изворни код није доступан
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Погледајте <a>проблем #3741</a> за подржане сценарије и планирана побољшања.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Асемблерски код није доступан
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Погледајте <a>проблем #4520</a> за подржане сценарије и планирана побољшања.
# The toggle button for making the bottom box fullscreen.
BottomBox--hide-fullscreen =
    .title = Изађи из целог екрана
# The toggle button for making the bottom box fullscreen.
BottomBox--show-fullscreen =
    .title = Цео екран
SourceView--close-button =
    .title = Затвори преглед изворног кода

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Не постоји позната URL адреса приступачна путем cross-origin-а за ову датотеку.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Дошло је до мрежне грешке при преузимању URL адресе { $url }: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Није било могуће упити API за симболизацију прегледача: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = API за симболизацију прегледача је вратио грешку: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = API за симболизацију локалног сервера симбола је вратио грешку: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = API за симболизацију прегледача је вратио неисправан одговор: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = API за симболизацију локалног сервера симбола је вратио неисправан одговор: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Датотека { $pathInArchive } није пронађена у архиви са адресе { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Није било могуће анализирати архиву на адреси { $url }: { $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = Прегледач није успео да преузме изворну датотеку за { $url } са sourceUuid { $sourceUuid }: { $errorMessage }.

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Прикажи преглед асемблера
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Сакриј преглед асемблера
# The "◀" button above the assembly view.
AssemblyView--prev-button =
    .title = Претходно
# The "▶" button above the assembly view.
AssemblyView--next-button =
    .title = Следеће
# The label showing the current position and total count above the assembly view.
# Variables:
#   $current (Number) - The current position (1-indexed).
#   $total (Number) - The total count.
AssemblyView--position-label = { $current } од { $total }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Послати снимци
