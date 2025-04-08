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

AppViewRouter--error-from-post-message = Немагчыма імпартаваць профіль.
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
CallNodeContextMenu--transform-merge-call-node = Аб'яднаць толькі вузел
    .title =
        Аб'яднанне вузла выдаляе яго з профілю і прызначае яго час
        вузлу функцыі, які яго выклікаў. Гэта толькі выдаляе функцыю з гэтай 
        канкрэтнай часткі дрэва. Любыя іншыя месцы, адкуль была выклікана функцыя, 
        застануцца ў профілі.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Засяроджванне ўвагі на функцыі выдаліць усе ўзоры, якія не ўключаюць яе
    функцыя. Акрамя таго, ён паўторна выкараняе дрэва выклікаў, каб функцыя
    з'яўляецца адзіным коранем дрэва. Гэта можа аб'яднаць некалькі сайтаў выкліку функцый
    праз профіль у адзін вузел выкліку.
CallNodeContextMenu--transform-focus-function = Фокус на функцыі
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Фокус на функцыі (інвертавана)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Фокус толькі на паддрэве
    .title = Фокус на паддрэве прывядзе да выдалення любога ўзору, які не ўключае гэтую канкрэтную частку дрэва выклікаў. Гэта выдаляе галіну дрэва выклікаў, але робіць гэта толькі для аднаго вузла выкліку. Усе іншыя выклікі функцый ігнаруюцца.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Фокус на катэгорыі <strong>{ $categoryName }</strong>
    .title =
        Факусіраванне на вузлах, якія адносяцца да той жа катэгорыі, што і абраны вузел, 
        такім чынам аб'ядноўваючы ўсе вузлы, якія належаць да іншай катэгорыі.
CallNodeContextMenu--transform-collapse-function-subtree = Згарнуць функцыю
    .title = Згортванне функцыі выдаляе ўсё, што яна выклікала, і прызначае ўвесь час гэтай функцыі. Гэта можа дапамагчы спрасціць профіль, які выклікае код, які не трэба аналізаваць.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Згарнуць <strong>{ $nameForResource }</strong>
    .title = Згортванне рэсурсу згладзіць усе выклікі да гэтага рэсурсу ў адзіны згорнуты вузел выкліку.
CallNodeContextMenu--transform-collapse-recursion = Згарнуць рэкурсію
    .title =
        Згортванне рэкурсіі выдаляе выклікі, якія паўторна ідуць у адну
        і тую ж функцыю, нават з прамежкавымі функцыямі ў стэку.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Згарнуць толькі прамую рэкурсію
    .title =
        Згортванне прамой рэкурсіі выдаляе выклікі, якія паўторна ідуць
        у адну і тую ж функцыю без прамежкавых функцый у стэку.
CallNodeContextMenu--transform-drop-function = Адкінуць узоры з гэтай функцыяй
    .title = Адкідванне ўзораў выдаляе іх час з профілю. Гэта карысна для выдалення інфармацыі аб часе, які не мае дачынення да аналізу.
CallNodeContextMenu--expand-all = Разгарнуць усё
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Шукаць назву функцыі у Searchfox
CallNodeContextMenu--copy-function-name = Капіяваць назву функцыі
CallNodeContextMenu--copy-script-url = Капіяваць URL-адрас скрыпту
CallNodeContextMenu--copy-stack = Капіяваць стэк
CallNodeContextMenu--show-the-function-in-devtools = Паказаць функцыю ў DevTools

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Час працы (мс)
    .title =
        «Агульны» час працы ўключае суму ўсяго часу,
        на працягу якога гэта функцыя знаходзілася ў стэку. Сюды ўваходзіць час,
        на працягу якога функцыя фактычна выконвалася, а таксама час выканання выкліканых ёю функцый.
CallTree--tracing-ms-self = Уласны (мс)
    .title =
        "Уласны" час уключае толькі час, калі функцыя была канцом стэка.
        Калі гэтая функцыя выклікала іншыя функцыі, то час «іншых» функцый не ўлічваецца. «Уласны» час карысны для разумення таго, на што быў фактычна выдаткаваны час у праграме.
CallTree--samples-total = Усяго (узоры)
    .title = Лічыльнік “Усяго (узоры)” уключае ў сабе суму кожнага ўзору, у якога гэтая функцыя была выяўлена ў стэку. Сюды ўваходзіць час фактычнай працы функцыі, а таксама час чакання выкліканых ёю функцый.
CallTree--samples-self = Уласны
    .title =
        "Уласны" падлік выбарак уключае толькі ўзоры, дзе функцыя была канцом стэка. 
        Калі гэтая функцыя выклікала іншыя функцыі, то час «іншых» функцый не ўлічваецца. 
        «Уласны» падлік карысны для таго, каб зразумець, які час на самай справе быў выдаткаваны на праграму.
CallTree--bytes-total = Агульны памер (байты)
    .title =
        «Агульны памер» уключае суму ўсіх байтаў, выдзеленых або
        вызваленых, пакуль гэтая функцыя знаходзілася ў стэку.
        Гэта ўключае ў сябе як байты, дзе функцыя фактычна выконвалася, так і байты выкліканых ёю функцый.
CallTree--bytes-self = Уласны (байты)
    .title =
        "Уласная" колькасць байтаў уключае суму ўсіх байтаў, выдзеленых або вызваленых, калі функцыя знаходзілася ў канцы стэка.
        Калі гэтая функцыя выклікае іншыя функцыі, байты "іншых" функцый не ўключаюцца.
        «Уласны» падлік байтаў карысны для разумення таго, колькі памяці было фактычна выдзелена або вызвалена ў праграме.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Некаторыя выклікі { $calledFunction } былі ўбудаваны кампілятарам.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (убудаваны)
    .title = Выклікі функціі { $calledFunction } былі ўбудаваны кампілятарам у { $outerFunction }.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Выберыце вузел, каб паказаць інфармацыю аб ім.
CallTreeSidebar--call-node-details = Падрабязнасці вузла выкліку

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
    .label = Асочаны час працы
CallTreeSidebar--traced-self-time =
    .label = Асочаны ўласны час
CallTreeSidebar--running-time =
    .label = Час працы
CallTreeSidebar--self-time =
    .label = Уласны час
CallTreeSidebar--running-samples =
    .label = Выкананыя ўзоры
CallTreeSidebar--self-samples =
    .label = Уласныя ўзоры
CallTreeSidebar--running-size =
    .label = Выкананы памер
CallTreeSidebar--self-size =
    .label = Уласны памер
CallTreeSidebar--categories = Катэгорыі
CallTreeSidebar--implementation = Рэалізацыя
CallTreeSidebar--running-milliseconds = Выкананыя мілісекунды
CallTreeSidebar--running-sample-count = Колькасць выкананых узораў
CallTreeSidebar--running-bytes = Выкананыя байты
CallTreeSidebar--self-milliseconds = Уласныя мілісекунды
CallTreeSidebar--self-sample-count = Колькасць уласных узораў
CallTreeSidebar--self-bytes = Уласныя байты

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Увядзіце URL-адрасы профіляў, якія вы хочаце параўнаць
CompareHome--instruction-content =
    Інструмент будзе браць даныя з выбранай дарожкі і дыяпазону для 
    кожнага профілю і размяшчаць іх у адным выглядзе для зручнага 
    параўнання.
CompareHome--form-label-profile1 = Профіль 1:
CompareHome--form-label-profile2 = Профіль 2:
CompareHome--submit-button =
    .value = Атрымаць профілі

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Гэты профіль быў запісаны для зборцы без фінальных (рэлізных) аптымізацый.
        Назіраемая прадукцыйнасць можа адрознівацца ад фінальнай (рэлізнай) зборкі.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Адкрыць бакавую панэль
Details--close-sidebar-button =
    .title = Закрыць бакавую панэль
Details--error-boundary-message =
    .message = Ой, на гэтай панэлі адбылася невядомая памылка.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Калі ласка, паведаміце аб гэтай праблеме распрацоўшчыкам, дадаўшы 
    памылку, паказаную ў вэб-кансолі Інструментаў распрацоўшчыка.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Паведаміце пра памылку на GitHub

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

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = Дарожак: <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span>

## Home page

Home--upload-from-file-input-button = Загрузіць профіль з файла
Home--upload-from-url-button = Загрузіць профіль з URL
Home--load-from-url-submit-button =
    .value = Загрузіць
Home--documentation-button = Дакументацыя
Home--menu-button = Уключыць кнопку меню { -profiler-brand-name }
Home--menu-button-instructions =
    Уключыце кнопку меню прафайлера, каб пачаць запіс профілю прадукцыйнасці
    у { -firefox-brand-name }, затым прааналізуйце яго і падзяліцеся з profiler.firefox.com.
Home--profile-firefox-android-instructions =
    Вы таксама можаце зрабіць профіль { -firefox-android-brand-name }. Падрабязней
    можна даведацца ў дакументацыі:
    <a>Прафіляванне { -firefox-android-brand-name } непасрэдна на прыладзе</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Гэты экзэмпляр прафайлера не змог падключыцца да WebChannel, таму не атрымалася ўключыць кнопку меню прафайлера.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable =
    Гэты экзэмпляр прафайлера не змог падключыцца да WebChannel. Звычайна гэта азначае, 
    што ён працуе на хосце адрозным ад таго, які пазначаны ў параметрах
    <code>devtools.performance.recording.ui-base-url</code>. Калі вы хочаце запісаць новыя
    профілі з дапамогай гэтага экзэмпляра і даць яму праграмнае кіраванне кнопкай меню 
    прафайлера, вы можаце перайсці да <code>about:config</code> і змяніць налады.
Home--record-instructions =
    Каб пачаць запіс профілю, націсніце кнопку запісу або выкарыстоўвайце 
    спалучэнне клавіш. Падчас запісу профілю значок стане сіняга колеру.
    Націсніце <kbd>Захапіць</kbd>, каб запампаваць даныя на profiler.firefox.com.
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
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } таксама можа імпартаваць профілі з іншых прафайлераў, такіх як
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>,
    панэль прадукцыйнасці Chrome, <androidstudio>Android Studio</androidstudio> або
    любы файл, які выкарыстоўвае фарматы <dhat>dhat</dhat> або <traceevent>Google Trace Event</traceevent>. <write>Даведайцеся, як напісаць свой уласны імпарцёр</write>.
Home--install-chrome-extension = Усталяваць пашырэнне Chrome
Home--chrome-extension-instructions =
    Выкарыстоўвайце пашырэнне <a>{ -profiler-brand-name } для Chrome</a>
    каб захапіць профілі прадукцыйнасці ў Chrome і прааналізаваць іх
    у { -profiler-brand-name }. Усталюйце пашырэнне з інтэрнэт-крамы Chrome.
Home--chrome-extension-recording-instructions =
    Пасля ўсталявання выкарыстоўвайце значок пашырэння
    на панэлі інструментаў або цэтлікі для запуску і спынення прафілявання.
    Вы таксама можаце экспартаваць профілі і загрузіць іх тут для аналізу.

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
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Прагляд усіх вашых запісаў і кіраванне імі (яшчэ { $profilesRestCount })
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Кіраваць гэтым запісам
        [few] Кіраваць гэтымі запісамі
        [many] Кіраваць гэтымі запісамі
       *[other] Кіраваць гэтымі запісамі
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Наладзіць выбарку на аснове працягласці маркера
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

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Адкідваць сэмплы па-за межамі маркераў, якія адпавядаюць «<strong>{ $filter }</strong>»

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Фільтр маркераў:
    .title = Паказваць толькі маркеры, якія адпавядаюць пэўнаму імені
MarkerSettings--marker-filters =
    .title = Фільтры маркераў

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Выберыце маркер, каб паглядзець інфармацыю пра яго.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Пачатак
MarkerTable--duration = Працягласць
MarkerTable--name = Назва
MarkerTable--details = Падрабязнасці

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
MenuButtons--metaInfo--profile-symbolicated = Профіль сімвалізаваны
MenuButtons--metaInfo--profile-not-symbolicated = Профіль не сімвалізаваны
MenuButtons--metaInfo--resymbolicate-profile = Паўторна сімвалізаваць профіль
MenuButtons--metaInfo--symbolicate-profile = Сімвалізаваць профіль
MenuButtons--metaInfo--attempting-resymbolicate = Спроба паўторна сімвалізаваць профіль
MenuButtons--metaInfo--currently-symbolicating = Зараз профіль сімвалізуецца
MenuButtons--metaInfo--cpu-model = Мадэль ЦП:
MenuButtons--metaInfo--cpu-cores = Ядра ЦП:
MenuButtons--metaInfo--main-memory = Асноўная памяць:
MenuButtons--index--show-moreInfo-button = Паказаць больш
MenuButtons--index--hide-moreInfo-button = Паказаць менш
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } фізічнае ядро, { $logicalCPUs } лагічнае ядро
                [few] { $physicalCPUs } фізічнае ядро, { $logicalCPUs } лагічныя ядры
                [many] { $physicalCPUs } фізічнае ядро, { $logicalCPUs } лагічных ядзер
               *[other] { $physicalCPUs } фізічнае ядро, { $logicalCPUs } лагічных ядзер
            }
        [few]
            { $logicalCPUs ->
                [one] { $physicalCPUs } фізічныя ядры, { $logicalCPUs } лагічнае ядро
                [few] { $physicalCPUs } фізічныя ядры, { $logicalCPUs } лагічныя ядры
                [many] { $physicalCPUs } фізічныя ядры, { $logicalCPUs } лагічных ядзер
               *[other] { $physicalCPUs } фізічныя ядры, { $logicalCPUs } лагічных ядзер
            }
        [many]
            { $logicalCPUs ->
                [one] { $physicalCPUs } фізічных ядзер, { $logicalCPUs } лагічнае ядро
                [few] { $physicalCPUs } фізічных ядзер, { $logicalCPUs } лагічныя ядры
                [many] { $physicalCPUs } фізічных ядзер, { $logicalCPUs } лагічных ядзер
               *[other] { $physicalCPUs } фізічных ядзер, { $logicalCPUs } лагічных ядзер
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } фізічных ядзер, { $logicalCPUs } лагічнае ядро
                [few] { $physicalCPUs } фізічных ядзер, { $logicalCPUs } лагічныя ядры
                [many] { $physicalCPUs } фізічных ядзер, { $logicalCPUs } лагічных ядзер
               *[other] { $physicalCPUs } фізічных ядзер, { $logicalCPUs } лагічных ядзер
            }
    }
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
MenuButtons--metaInfo--profiling-started = Запіс пачаўся:
MenuButtons--metaInfo--profiling-session = Працягласць запісу:
MenuButtons--metaInfo--main-process-started = Асноўны працэс пачаўся:
MenuButtons--metaInfo--main-process-ended = Асноўны працэс скончыўся:
MenuButtons--metaInfo--interval = Інтэрвал:
MenuButtons--metaInfo--buffer-capacity = Ёмістасць буфера:
MenuButtons--metaInfo--buffer-duration = Працягласць буфера:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } секунда
        [few] { $configurationDuration } секунды
        [many] { $configurationDuration } секунд
       *[other] { $configurationDuration } секунд
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Неабмежавана
MenuButtons--metaInfo--application = Праграма
MenuButtons--metaInfo--name-and-version = Назва і версія:
MenuButtons--metaInfo--application-uptime = Час працы:
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

MenuButtons--metaOverheadStatistics-subtitle = Накладныя выдаткі { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Сярэдняе
MenuButtons--metaOverheadStatistics-max = Макс
MenuButtons--metaOverheadStatistics-min = Мін
MenuButtons--metaOverheadStatistics-statkeys-overhead = Накладныя выдаткі
    .title = Час затрачаны на атрыманне ўсіх патокаў.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Ачыстка
    .title = Час затрачаны на выдаленне старых даных.
MenuButtons--metaOverheadStatistics-statkeys-counter = Лічыльнік
    .title = Час збору ўсіх лічыльнікаў
MenuButtons--metaOverheadStatistics-statkeys-interval = Інтэрвал
    .title = Зафіксаваны інтэрвал паміж двума ўзорамі
MenuButtons--metaOverheadStatistics-statkeys-lockings = Блакіроўкі
    .title = Час затрачаны на атрыманне блакіроўкі перад правядзеннем вымярэнняў.
MenuButtons--metaOverheadStatistics-overhead-duration = Працягласць накладных выдаткаў:
MenuButtons--metaOverheadStatistics-overhead-percentage = Працэнт накладных выдаткаў:
MenuButtons--metaOverheadStatistics-profiled-duration = Працягласць запісу профілю:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Уключыць схаваныя патокі
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Уключыць даныя з іншых картак
MenuButtons--publish--renderCheckbox-label-hidden-time = Уключыць схаваны дыяпазон часу
MenuButtons--publish--renderCheckbox-label-include-screenshots = Уключыць здымкі экрана
MenuButtons--publish--renderCheckbox-label-resource = Уключыць URL-адрасы і шляхі рэсурсаў
MenuButtons--publish--renderCheckbox-label-extension = Уключыць інфармацыю аб пашырэнні
MenuButtons--publish--renderCheckbox-label-preference = Уключыць значэнні параметраў
MenuButtons--publish--renderCheckbox-label-private-browsing = Уключыць даныя з вокнаў прыватнага прагляду
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Гэты профіль змяшчае даныя прыватнага прагляду
MenuButtons--publish--reupload-performance-profile = Паўторна запампаваць профіль прадукцыйнасці
MenuButtons--publish--share-performance-profile = Абагуліць профіль прадукцыйнасці
MenuButtons--publish--info-description = Запампуйце свой профіль і зрабіце яго даступным для ўсіх, хто мае спасылку.
MenuButtons--publish--info-description-default = Тыпова вашы асабістыя даныя выдаляюцца.
MenuButtons--publish--info-description-firefox-nightly2 = Гэты профіль ад { -firefox-nightly-brand-name }, таму большая частка інфармацыі ўключана па змаўчанні.
MenuButtons--publish--include-additional-data = Уключыць дадатковыя даныя, якія могуць раскрыць вашу асобу
MenuButtons--publish--button-upload = Запампаваць
MenuButtons--publish--upload-title = Запампоўванне профілю…
MenuButtons--publish--cancel-upload = Скасаваць запампоўку
MenuButtons--publish--message-something-went-wrong = Ой, нешта пайшло не так падчас загрузкі профілю.
MenuButtons--publish--message-try-again = Паспрабаваць зноў
MenuButtons--publish--download = Спампаваць
MenuButtons--publish--compressing = Сцісканне…
MenuButtons--publish--error-while-compressing = Памылка пры сцісканні, паспрабуйце зняць некаторыя птушкі, каб паменшыць памер профілю.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Фільтраваць сеткі:
    .title = Паказваць толькі сеткавыя запыты, якія адпавядаюць пэўнаму імені

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

PanelSearch--search-field-hint = Вы ведаеце, што для пошуку па некалькіх тэрмінах можна выкарыстоўваць коску (,)?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Змяніць назву профілю
ProfileName--edit-profile-name-input =
    .title = Змяніць назву профілю
    .aria-label = Назва профілю

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

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Пры выдаленні гэтага профілю адбылася памылка. <a>Навядзіце курсор, каб даведацца больш.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Выдаліць { $profileName }
ProfileDeletePanel--dialog-confirmation-question =
    Вы ўпэўнены, што хочаце выдаліць запампаваныя даныя для гэтага профілю? Спасылкі,
    якія былі абагулены раней, больш не будуць працаваць.
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

ProfileLoaderAnimation--loading-from-post-message = Імпарт і апрацоўка профілю…
ProfileLoaderAnimation--loading-unpublished = Імпарт профілю непасрэдна з { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Чытанне файла і апрацоўка профілю…
ProfileLoaderAnimation--loading-local = Яшчэ не рэалізавана.
ProfileLoaderAnimation--loading-public = Спампоўка і апрацоўка профілю…
ProfileLoaderAnimation--loading-from-url = Спампоўка і апрацоўка профілю…
ProfileLoaderAnimation--loading-compare = Чытанне і апрацоўка профіляў…
ProfileLoaderAnimation--loading-view-not-found = Прагляд не знойдзены

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Вярнуцца на галоўную

## Root

Root--error-boundary-message =
    .message = Ой, на profiler.firefox.com адбылася невядомая памылка.

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

StackSettings--implementation-all-frames = Усе кадры
    .title = Не фільтраваць кадры стэка
StackSettings--implementation-javascript2 = JavaScript
    .title = Паказваць толькі кадры стэка, звязаныя з выкананнем JavaScript
StackSettings--implementation-native2 = Убудаваны
    .title = Паказваць толькі кадры стэка для платформна-залежнага кода
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Фільтр стэкаў:
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
StackSettings--invert-call-stack = Інвертаваць стэк выклікаў
    .title = Сартаваць па часе, праведзенаму ў вузле выкліку, ігнаруючы яго даччыныя вузлы.
StackSettings--show-user-timing = Паказаць таймінгі карыстальніка
StackSettings--panel-search =
    .label = Фільтр стэкаў:
    .title = Паказаць толькі стэкі, якія змяшчаюць функцыю, назва якой адпавядае гэтаму падрадку

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Дрэва выклікаў
TabBar--flame-graph-tab = Флэйм-дыяграма
TabBar--stack-chart-tab = Дыяграма стэка
TabBar--marker-chart-tab = Маркерная дыяграма
TabBar--marker-table-tab = Маркерная табліца
TabBar--network-tab = Сетка
TabBar--js-tracer-tab = JS Tracer

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Усе карткі і вокны

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Паказваць толькі гэты працэс
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Паказваць толькі “{ $trackName }”
TrackContextMenu--hide-other-screenshots-tracks = Схаваць дарожкі іншых здымкаў
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Схаваць “{ $trackName }”
TrackContextMenu--show-all-tracks = Паказаць усе дарожкі
TrackContextMenu--show-local-tracks-in-process = Паказаць усе дарожкі ў гэтым працэсе
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Схаваць усе трэкі тыпу “{ $type }”
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Паказаць усе адпаведныя дарожкі
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Схаваць усе адпаведныя дарожкі
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Няма вынікаў для “<span>{ $searchFilter }</span>”
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Схаваць дарожку
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Схаваць працэс

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = адносная памяць на гэты момант
TrackMemoryGraph--memory-range-in-graph = дыяпазон памяці ў графіку
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = размеркаванні і вызваленні з моманту папярэдняга ўзору

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
    .label = Магутнасць
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } Вт
    .label = Магутнасць
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } мВт
    .label = Магутнасць
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } кВт
    .label = Сярэдняя магутнасць у бягучым вылучэнні
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } Вт
    .label = Сярэдняя магутнасць у бягучым вылучэнні
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } мВт
    .label = Сярэдняя магутнасць у бягучым вылучэнні
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } кг CO₂e)
    .label = Энергія, якая выкарыстоўваецца ў бачным дыяпазоне
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Вт·гад ({ $carbonValue } г CO₂e)
    .label = Энергія, якая спажываецца ў бачным дыяпазоне
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } мВт·гад ({ $carbonValue } мг CO₂e)
    .label = Энергія, якая спажываецца ў бачным дыяпазоне
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } мкВт·гад ({ $carbonValue } мг CO₂e)
    .label = Энергія, якая спажываецца ў бачным дыяпазоне
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } кг CO₂e)
    .label = Энергія, якая выкарыстоўваецца ў бягучай выбарцы
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Вт·гад ({ $carbonValue } г CO₂e)
    .label = Энергія, якая спажываецца ў бягучай выбарцы
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } мВт·гад ({ $carbonValue } мг CO₂e)
    .label = Энергія, якая спажываецца ў бягучай выбарцы
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } мкВт·гад ({ $carbonValue } мг CO₂e)
    .label = Энергія, якая спажываецца ў бягучай выбарцы

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
TrackBandwidthGraph--speed = { $value } у секунду
    .label = Хуткасць перадачы для гэтай выбаркі
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = аперацый уводу/вываду з часу папярэдняй выбаркі
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } г CO₂e)
    .label = Звесткі, перасланыя да гэтага часу
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } г CO₂e)
    .label = Звесткі, перасланыя ў бачным прамежку
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } г CO₂e)
    .label = Звесткі, перасланыя ў бягучым вылучэнні

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Увядзіце ўмовы фільтра
    .title = Адлюстроўваць толькі дарожкі, якія адпавядаюць пэўнаму тэксту

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
TransformNavigator--complete = “{ $item }” поўнасцю
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Згарнуць: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Вузел у фокусе: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Фокус: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Катэгорыя ў фокусе: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Аб'яднаць вузел: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Аб'яднаць: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Адхілена: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Згарнуць рэкурсію: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Згарнуць толькі прамую рэкурсію: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Згарнуць паддрэва: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Адкідваць сэмплы па-за межамі маркераў, якія адпавядаюць: “{ $item }”

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Чаканне { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Чаканне { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Зыходны код недаступны
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Глядзіце <a>абмеркаванне #3741</a> каб даведацца аб сцэнарыях, якія падтрымліваюцца, і запланаваных паляпшэннях.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Код асэмблера недаступны
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Глядзіце <a>абмеркаванне #4520</a> каб даведацца аб сцэнарыях, якія падтрымліваюцца, і запланаваных паляпшэннях.
SourceView--close-button =
    .title = Закрыць акно з кодам

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Для гэтага файла няма вядомага cross-origin-accessible URL-адраса.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Пры атрыманні URL { $url } адбылася памылка сеткі: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Не ўдалося запытаць API сімвалізацыі браўзера: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = API сімвалізацыі браўзера вярнула памылку: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = API сімвалізацыі лакальнага сервера сімвалаў вярнула памылку: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = API сімвалізацыі браўзера вярнула няправільны адказ: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = API сімвалізацыі лакальнага сервера вярнула няправільны адказ: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Файл { $pathInArchive } не быў знойдзены ў архіве з { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Не ўдалося прааналізаваць архіў па адрасе { $url }: { $parsingErrorMessage }

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Паказаць прагляд асэмблера
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Схаваць прагляд асэмблера

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Запампаваныя запісы
