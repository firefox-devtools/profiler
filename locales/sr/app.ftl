# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox за Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Профајлер
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> - <subheader>Веб-програм за анализу перформанси { -firefox-brand-name }-а</subheader>
AppHeader--github-icon =
    .title = Идите на нашу Git ризницу (ово се отвара у новом прозору)

## ThemeToggle
## They are used at the top right side of the home page to switch between themes.

ThemeToggle--system =
    .title = Пратите подешавање теме система
ThemeToggle--light =
    .title = Користи светлу тему
ThemeToggle--dark =
    .title = Користите тамну тему

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
    .message = Ух-бре, нека непозната грешка се догодила у овој површи.

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
    .placeholder = Унесите термине за филтрирање

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

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Покрени
MarkerTable--duration = Трајање
MarkerTable--name = Назив
MarkerTable--details = Детаљи

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--permalink--button =
    .label = Трајна веза

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Отпремљено:
MenuButtons--index--profile-info-uploaded-actions = Обриши
MenuButtons--index--metaInfo-subtitle = Информације о профилу
MenuButtons--metaInfo--symbols = Симболи:
