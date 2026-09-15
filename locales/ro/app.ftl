# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox pentru Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Aplicație web pentru analiza performanței { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Mergi în depozitarul nostru Git (se deschide într-o fereastră nouă)

## ThemeToggle
## They are used at the top right side of the home page to switch between themes.

ThemeToggle--system =
    .title = Urmează preferințele de temă din sistem
ThemeToggle--light =
    .title = Folosește tema luminoasă
ThemeToggle--dark =
    .title = Folosește tema întunecată

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Profilul nu a putut fi importat.
AppViewRouter--error-unpublished = Nu s-a putut recupera profilul de la { -firefox-brand-name }.
AppViewRouter--error-from-file = Fișierul nu poate fi citit sau nu se poate analiza profilul din el.
AppViewRouter--error-local = Nu este încă implementat.
AppViewRouter--error-public = Profilul nu poate fi descărcat.
AppViewRouter--error-from-url = Profilul nu poate fi descărcat.
AppViewRouter--error-compare = Profilele nu pot fi recuperate.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    Din cauza unei <a>limitări specifice din Safari</a>, { -profiler-brand-name } nu poate
    importa profiluri din mașina locală în acest browser. Te rugăm să deschizi, 
    în schimb, pagina în { -firefox-brand-name } sau Chrome.
    .title = Safari nu poate importa profiluri locale
# This error message is displayed when the profile is in a newer format version
# than this build of the Profiler is able to read.
AppViewRouter--error-profile-version =
    Profilul folosește un format care nu are suport în această versiune { -profiler-brand-name }.
    Încearcă să reîmprospătezi pagina ca să vezi dacă nu cumva există o actualizare disponibilă pentru { -profiler-brand-name }.
AppViewRouter--route-not-found--home =
    .specialMessage = URL-ul pe care ai încercat să intri nu este recunoscut.

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (integrată)
    .title = { $function } a fost integrată în apelantul ei de către compilator.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Arată <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Îmbină funcția
    .title =
        Îmbinarea unei funcții elimină funcția din profil și timpul ei este alocat
        funcției care a apelat-o. Se întâmplă oriunde funcția a fost apelată în
        arbore.
CallNodeContextMenu--transform-merge-call-node = Îmbină numai nodul
    .title =
        Îmbinarea unui nod elimină nodul din profil și timpul lui este alocat
        nodului funcției care l-a apelat. Elimină doar funcția din
        acea parte specifică a arborelui. Orice alte locuri din care a fost apelată funcția
        vor rămâne în profil.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Focalizarea pe o funcție va elimina orice eșantion care nu include funcția
    respectivă. În plus, reface rădăcina arborelui de apelare astfel încât funcția
    să fie singura rădăcină a arborelui. Poate combina mai multe situri de apelare a funcțiilor
    dintr-un profil într-un singur nod de apelare.
CallNodeContextMenu--transform-focus-function = Focalizare pe funcție
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Focalizare pe funcție (inversată)
    .title = { CallNodeContextMenu--transform-focus-function-title }

## The translation for "self" in these strings should match the translation used
## in CallTree--samples-self and CallTree--bytes-self. Alternatively it can be
## translated as "self values" or "self time" (though "self time" is less desirable
## because this menu item is also shown in "bytes" mode).

CallNodeContextMenu--transform-focus-self-title =
    Focalizarea pe „proprii” este similară cu focalizarea pe o funcție, dar reține doar eșantioanele
    care contribuie la timpul propriu al funcției. Eșantioanele din funcțiile apelate
    sunt abandonate, iar arborele de apelare primește altă rădăcină, pe funcția focalizată.
CallNodeContextMenu--transform-focus-self = Focalizare numai pe proprii
    .title = { CallNodeContextMenu--transform-focus-self-title }

##

CallNodeContextMenu--transform-focus-subtree = Focalizare numai pe sub-arbore
    .title =
        Focalizarea pe un sub-arbore va elimina orice eșantion care nu include
        acea parte specifică a arborelui de apelare. Extrage o ramură a arborelui de apelare,
        dar o face numai pentru nodul de apelare individual respectiv. Toate celelalte apelări
        ale funcției sunt ignorate.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Focalizare pe categorie <strong>{ $categoryName }</strong>
    .title =
        Focalizarea pe noduri din aceeași categorie cu nodul selectat,
        îmbinând, prin urmare, toate nodurile care aparțin unei alte categorii.
CallNodeContextMenu--transform-collapse-function-subtree = Restrânge funcția
    .title =
        Restrângerea unei funcții va elimina orice a apelat și va aloca
        tot timpul funcției. Poate ajuta la simplificarea unui profil care
        apelează în cod ceva ce nu trebuie să fie analizat.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Restrânge <strong>{ $nameForResource }</strong>
    .title =
        Restrângerea unei resurse va aplatiza toate apelurile către
        resursa respectivă într-un nod de apelare unic și restrâns.
CallNodeContextMenu--transform-collapse-recursion = Restrânge recursivitatea
    .title =
        Restrângerea recursivității elimină apelurile care apelează recursiv repetitiv
        aceeași funcție, chiar cu funcții intermediare în stivă.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Restrânge numai recursivitatea directă
    .title =
        Restrângerea recursivității directe elimină apelurile care apelează recursiv repetitiv
        aceeași funcție fără funcții intermediare în stivă.
CallNodeContextMenu--transform-drop-function = Ignoră eșantioanele cu această funcție
    .title =
        Ignorarea eșantioanelor le elimină timpul din profil. Este util pentru
        eliminarea informațiilor de timp care nu sunt relevante pentru analiză.
CallNodeContextMenu--expand-all = Extinde tot
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Caută denumirea funcției pe Searchfox
CallNodeContextMenu--copy-function-name = Copiază denumirea funcției
CallNodeContextMenu--copy-script-url = Copiază URL-ul scriptului
CallNodeContextMenu--copy-stack = Copiază stiva
CallNodeContextMenu--show-the-function-in-devtools = Arată funcția în DevTools

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Timp de execuție (ms)
    .title =
        Timpul „total” de execuție include un rezumat al tuturor timpilor în care
        funcția a fost observată ca fiind în stivă. Include timpul când
        funcția a rulat efectiv și timpul petrecut în apelanții din
        această funcție.
CallTree--tracing-ms-self = Proprii (ms)
    .title =
        Timpul „propriu” include numai timpul în care funcția era
        la sfârșitul stivei. Dacă funcția a apelat alte funcții,
        atunci timpul „celorlalte” funcții nu este inclus. Timpul „propriu” este util
        pentru înțelegerea modului în care a fost petrecut timpul într-un program.
CallTree--samples-total = Total (eșantioane)
    .title =
        Numărul „total” de eșantioane include un rezumat al fiecărui eșantion în care
        funcția a fost observată ca fiind în stivă. Include timpul în care
        funcția a rulat efectiv și timpul petrecut în apelanții din această
        funcție.
CallTree--samples-self = Propriu
    .title =
        Numărul de eșantioane „proprii” include numai eșantioanele în care funcția era
        la sfârșitul stivei. Dacă funcția a apelat alte funcții,
        atunci numărătorile „celorlalte” funcții nu sunt incluse. Numărătoarea „proprii” este utilă
        pentru înțelegerea modului în care a fost petrecut timpul într-un program.
CallTree--bytes-total = Mărime totală (octeți)
    .title =
        „Mărimea totală” include un rezumat al tuturor octeților alocați sau
        dealocați în timp ce funcția a fost observată ca fiind în stivă.
        Include atât octeți când funcția rula efectiv, cât și
        octeți ai apelanților de la această funcție.
CallTree--bytes-self = Proprii (octeți)
    .title =
        Octeții „proprii” includ octeții alocați sau dealocați când
        funcția era la sfârșitul stivei. Dacă funcția a apelat
        alte funcții, atunci octeții „celorlalte” funcții nu sunt incluși.
        Octeții „proprii” sunt utili pentru înțelegerea modului în care a fost de fapt
        alocată și dealocată memoria în program.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Unele apeluri către { $calledFunction } ai fost încorporate de compilator.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (încorporate)
    .title = Apelurile către { $calledFunction } au fost încorporate în { $outerFunction } de către compilator.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Selectează un nod pentru afișarea informațiilor despre el.
CallTreeSidebar--call-node-details = Detalii nod de apelare

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
    .label = Timp de execuție urmărit
CallTreeSidebar--traced-self-time =
    .label = Timp propriu urmărit
CallTreeSidebar--running-time =
    .label = Timp de execuție
CallTreeSidebar--self-time =
    .label = Timp propriu
CallTreeSidebar--running-samples =
    .label = Eșantioane de execuție
CallTreeSidebar--self-samples =
    .label = Eșantioane proprii
CallTreeSidebar--running-size =
    .label = Mărime de execuție
CallTreeSidebar--self-size =
    .label = Mărime proprie
CallTreeSidebar--categories = Categorii
CallTreeSidebar--implementation = Implementare
CallTreeSidebar--running-milliseconds = Milisecunde de execuție
CallTreeSidebar--running-sample-count = Număr eșantioane de execuție
CallTreeSidebar--running-bytes = Octeți de execuție
CallTreeSidebar--self-milliseconds = Milisecunde proprii
CallTreeSidebar--self-sample-count = Număr eșantioane proprii
CallTreeSidebar--self-bytes = Octeți proprii

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Introdu URL-urile profilurilor pe care vrei să le compari
CompareHome--instruction-content =
    Instrumentul va extrage datele din pista și intervalul selectate pentru 
    fiecare profil și le va pune în același ecran de vizualizare pentru ușurință la 
    comparare.
CompareHome--form-label-profile1 = Profilul 1:
CompareHome--form-label-profile2 = Profilul 2:
CompareHome--submit-button =
    .value = Recuperează profilurile

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Profilul a fost înregistrat într-o versiune fără optimizări de lansare.
        Este posibil ca observațiile de performanță să nu se aplice utilizatorilor versiunii finale.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Deschide bara laterală
Details--close-sidebar-button =
    .title = Închide bara laterală
Details--error-boundary-message =
    .message = O, nu! A apărut o eroare necunoscută în acest panou.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Te rugăm să raportezi dezvoltatorilor problema întâmpinată, inclusiv eroarea
    completă, așa cum este afișată în consola web a instrumentelor pentru dezvoltatori.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Raportează eroarea pe GitHub

## Settings Menu
## The settings popup opened from the cog icon in the top bar.

SettingsMenu--button =
    .title = Setări
SettingsMenu--docs = Documentație
SettingsMenu--legal = Mențiuni legale
SettingsMenu--privacy = Confidențialitate
SettingsMenu--cookies = Cookie-uri
SettingsMenu--language-switcher =
    .title = Schimbă limba

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> piste

## Home page

Home--upload-from-file-input-button = Încarcă un profil dintr-un fișier
Home--upload-from-url-button = Încarcă un profil dintr-un URL
Home--load-from-url-submit-button =
    .value = Încarcă
Home--documentation-button = Documentație
Home--menu-button = Activează butonul de meniu { -profiler-brand-name }
Home--menu-button-instructions =
    Activează butonul de meniu al utilitarului de profilare ca să începi înregistrarea unui profil
    de performanță în { -firefox-brand-name }, apoi îl analizezi și îl partajezi cu profiler.firefox.com.
Home--profile-firefox-android-instructions =
    Poți profila și { -firefox-android-brand-name }. Pentru mai
    multe informații, vezi documentația:
    <a>Profilare { -firefox-android-brand-name } direct pe dispozitiv</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Instanța utilitarului de profilare nu a putut să se conecteze la WebChannel, deci nu poate activa butonul de meniu al utilitarului de profilare.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable =
    Instanța utilitarului de profilare nu a putut să se conecteze la WebChannel. De obicei, înseamnă că
    rulează pe o gazdă diferită de cea care este specificată în preferințele
    <code>devtools.performance.recording.ui-base-url</code>. Dacă vrei să faci capturi de
    profiluri noi cu această instanță și să îi dai control de programare butonului de meniu din utilitarul de profilare,
    poți merge în <code>about:config</code> și să schimbi preferințele.
Home--record-instructions =
    Ca să începi profilarea, dă clic pe butonul de profilare sau folosește
    comenzile rapide din tastatură. Pictograma e albastră când se înregistrează un profil.
    Dă clic pe <kbd>Captură</kbd> pentru încărcarea datelor în profiler.firefox.com.
Home--instructions-content2 =
    Înregistrarea de profiluri de performanță necesită <a>{ -firefox-brand-name } pentru desktop</a>.
    Dar profilurile existente pot fi vizualizate în orice browser modern.
Home--fenix-instructions-directly =
    { -firefox-android-brand-name } poate fi profilat direct pe acest dispozitiv. Pentru
    mai multe informații, citește <a>Profilare { -firefox-android-brand-name } direct pe dispozitiv</a>.
Home--fenix-instructions-remotely =
    Poți profila { -firefox-android-brand-name } și de la distanță din { -firefox-brand-name }
    pentru desktop. Pentru mai multe informații, te rugăm să consulți documentația:
    <a>Profilare { -firefox-android-brand-name } de la distanță</a>.
Home--record-instructions-start-stop = Oprește și pornește profilarea
Home--record-instructions-capture-load = Fă o captură de profil și încarcă-l
Home--profiler-motto = Fă o captură cu un profil de performanță. Analizează-l. Partajează-l. Fă webul mai rapid.
Home--additional-content-title = Încarcă profiluri existente
Home--additional-content-content = Poți <strong>trage și plasa</strong> un fișier de profil aici ca să îl încarci sau:
Home--compare-recordings-info = Poți și compara înregistrări. <a>Deschide interfața de comparații.</a>
Home--your-recent-uploaded-recordings-title = Înregistrările tale încărcate recent
Home--dark-mode-title = Mod întunecat
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } poate și importa profiluri din alte utilitare de profilare, cum ar fi
    <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>,
    panoul de performanță Chrome, <androidstudio>Android Studio</androidstudio> sau
    orice fișier care folosește <dhat>formatul dhat</dhat> sau <traceevent>formatul Google Trace Event
    </traceevent>. <write>Află cum să-ți scrii
    propriul importator</write>.
Home--install-chrome-extension = Instalează extensia pentru Chrome
Home--chrome-extension-instructions =
    Folosește <a>{ -profiler-brand-name } extensia pentru Chrome</a>
    ca să faci capturi cu profiluri de performanță în Chrome pe care să le analizezi în
    { -profiler-brand-name }. Instalează extensia din Chrome Web Store.
Home--chrome-extension-recording-instructions =
    Odată instalată, folosește pictograma
    de bară de instrumente a extensiei sau comenzile rapide ca să începi și să oprești profilarea. Poți și
    să exporți profiluri pe care să le încarci aici pentru analiză detaliată.

## IdleSearchField
## The component that is used for all the search inputs in the application.

# `/` here overrides Firefox's Type Ahead Find shortcut, which would
# otherwise trigger an unhelpful find bar on top of the profiler UI.
# The shortcut itself is not localizable.
IdleSearchField--search-input2 =
    .placeholder = Introdu termenii filtrului (/)

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Afișează numai timpul propriu
    .title = Afișează numai timpul petrecut într-un nod de apelare, ignorând copiii.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Dă clic aici pentru încărcarea profilului { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Șterge
    .title = Profilul nu poate fi șters pentru că nu avem informațiile de autorizare.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Nu a fost încărcat niciun profil încă!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Vezi și gestionezi toate înregistrările (încă { $profilesRestCount })
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Gestionează înregistrarea
       *[other] Gestionează înregistrările
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Setează selecția de la durata marcajului
MarkerContextMenu--start-selection-here = Începe selecția de aici
MarkerContextMenu--end-selection-here = Termină selecția aici
MarkerContextMenu--start-selection-at-marker-start = Începe selecția la <strong>începutul</strong> marcajului
MarkerContextMenu--start-selection-at-marker-end = Începe selecția la <strong>sfârșitul</strong> marcajului
MarkerContextMenu--end-selection-at-marker-start = Termină selecția la <strong>începutul</strong> marcajului
MarkerContextMenu--end-selection-at-marker-end = Termină selecția la <strong>sfârșitul</strong> marcajului
MarkerContextMenu--copy-description = Copiază descrierea
MarkerContextMenu--copy-call-stack = Copiază stiva de apeluri
MarkerContextMenu--copy-url = Copiază URL-ul
MarkerContextMenu--copy-page-url = Copiază URL-ul paginii
MarkerContextMenu--copy-as-json = Copiază ca JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Selectează firul destinatarului „<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Selectează firul expeditorului „<strong>{ $threadName }</strong>”

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Abandonează eșantioanele din afara marcajelor corelate cu „<strong>{ $filter }</strong>”

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = Copiază tabelul de marcaje ca text simplu
MarkerCopyTableContextMenu--copy-table-as-markdown = Copiază tabelul de marcaje ca Markdown

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filtrează marcajele:
    .title = Afișează numai marcaje care se potrivesc cu o anumită denumire
MarkerSettings--marker-filters =
    .title = Filtre de marcaje
MarkerSettings--copy-table =
    .title = Copiază tabelul ca text
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = Numărul de rânduri depășește limita: { $rows } > { $maxRows }. Numai primele { $maxRows } (de) rânduri vor fi copiate.

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Selectează un marcaj pentru afișarea informațiilor despre el.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Pornește
MarkerTable--duration = Durată
MarkerTable--name = Denumire
MarkerTable--details = Detalii

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .aria-label = Afișează numai marcaje care corespund: „{ $filter }”
    .title = Afișează numai marcaje care corespund: „{ $filter }”

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Informații profil
MenuButtons--index--full-view = Vizualizare completă
MenuButtons--index--cancel-upload = Anulează încărcarea
MenuButtons--index--download =
    .label = Descarcă…
MenuButtons--index--share =
    .label = Partajează…
MenuButtons--index--reshare =
    .label = Repartajează…
MenuButtons--index--share-error-uploading =
    .label = Eroare la încărcare
MenuButtons--index--revert = Revino la profilul inițial
MenuButtons--permalink--button =
    .label = Permalink

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Încărcat:
MenuButtons--index--profile-info-uploaded-actions = Șterge
MenuButtons--index--metaInfo-subtitle = Informații profil
MenuButtons--metaInfo--symbols = Simboluri:
MenuButtons--metaInfo--profile-symbolicated = Profilul este simbolizat
MenuButtons--metaInfo--profile-not-symbolicated = Profilul nu este simbolizat
MenuButtons--metaInfo--resymbolicate-profile = Resimbolizează profilul
MenuButtons--metaInfo--symbolicate-profile = Simbolizează profilul
MenuButtons--metaInfo--attempting-resymbolicate = Se încearcă resimbolizarea profilului
MenuButtons--metaInfo--currently-symbolicating = Simbolizare profil în curs
MenuButtons--metaInfo--source-maps = Hărți-sursă:
# The trailing ellipsis indicates that clicking the button opens a file picker.
MenuButtons--metaInfo--apply-source-map = Aplică harta-sursă…
    .title = Încarcă un fișier .map de pe disc pentru simbolizarea unui pachet JavaScript minificat, pentru recuperarea denumirilor inițiale ale funcțiilor și a locațiilor-sursă.
# Shown when the uploaded map could match more than one source and the user has
# to choose which one it applies to.
MenuButtons--metaInfo--source-map-choose-bundle = Alege cărui pachet i se aplică această hartă-sursă:
# Button to confirm the chosen source and apply the source map to it.
MenuButtons--metaInfo--source-map-apply = Aplică
# Button to dismiss the source chooser without symbolicating.
MenuButtons--metaInfo--source-map-cancel = Anulează
# Shown after symbolication finished and original sources were resolved.
# Variable:
#   $filename (String) - The bundle source the source map was applied to.
MenuButtons--metaInfo--source-map-success = Surse inițiale rezolvate pentru { $filename }.
# Shown after symbolication finished but no stack positions matched the map.
# Variable:
#   $filename (String) - The bundle source the source map was applied to.
MenuButtons--metaInfo--source-map-no-match = Fără poziții în stivă în { $filename } care să corespundă acestei hărți-sursă.
MenuButtons--metaInfo--source-map-error-invalid = Fișierul selectat nu este o hartă-sursă validă.
MenuButtons--metaInfo--source-map-error-no-eligible = Profilul nu are niciun pachet JS cu URL-uri ale hărții-sursă.

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Overhead { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Medie
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Overhead
    .title = Timp pentru eșantionarea tutor firelor.
MenuButtons--metaOverheadStatistics-statkeys-interval = Interval
    .title = Interval observat între două eșantioane.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Blocaje
    .title = Timp pentru achiziția blocajului înainte de eșantionare.
MenuButtons--metaOverheadStatistics-overhead-duration = Durate overhead:
MenuButtons--metaOverheadStatistics-overhead-percentage = Procentaj overhead:
MenuButtons--metaOverheadStatistics-profiled-duration = Durată profilată:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Include firele ascunse
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Include datele din celelalte file
MenuButtons--publish--renderCheckbox-label-hidden-time = Include intervalul ascuns de timp
MenuButtons--publish--renderCheckbox-label-include-screenshots = Include capturile de ecran
MenuButtons--publish--renderCheckbox-label-resource = Include URL-urile și căile resurselor
MenuButtons--publish--renderCheckbox-label-extension = Include informațiile despre extensii
MenuButtons--publish--renderCheckbox-label-preference = Include valorile despre preferințe
MenuButtons--publish--renderCheckbox-label-private-browsing = Include datele din ferestrele de navigare privată
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Profilul conține date de navigare privată
MenuButtons--publish--renderCheckbox-label-argument-values = Include valorile argumentelor funcțiilor de urmărire a execuției JavaScript
MenuButtons--publish--renderCheckbox-label-argument-values-warning-image =
    .title = Profilul conține valori ale argumentelor funcțiilor înregistrate din pagină, care pot include date cu caracter personal
MenuButtons--publish--share-performance-profile = Partajează profilul de performanță
MenuButtons--publish--reshare-performance-profile = Repartajează profilul de performanță
MenuButtons--publish--download-performance-profile = Descarcă profilul de performanță
MenuButtons--publish--info-description = Încarcă profilul și fă-l accesibil oricui are linkul.
MenuButtons--publish--download-info-description = Salvează profilul ca fișier pe calculator.
MenuButtons--publish--info-description-default = Datele tale cu caracter personal sunt eliminate implicit.
MenuButtons--publish--info-description-firefox-nightly2 = Profilul este din { -firefox-nightly-brand-name }. Deci, implicit, include majoritatea informațiilor.
MenuButtons--publish--include-additional-data = Include date suplimentare care pot fi identificabile
MenuButtons--publish--button-upload = Încarcă
MenuButtons--publish--upload-title = Se încarcă profilul…
MenuButtons--publish--cancel-upload = Anulează încărcarea
MenuButtons--publish--message-something-went-wrong = O, nu! Ceva nu a mers la încărcarea profilului.
MenuButtons--publish--message-try-again = Încearcă din nou
MenuButtons--publish--download = Descarcă
MenuButtons--publish--compressing = Compresie în curs…
MenuButtons--publish--error-while-compressing = Eroare la comprimare. Încearcă să debifezi unele casete de verificare pentru reducerea dimensiunii profilului.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrează rețelele:
    .title = Afișează numai cereri în rețea care se potrivesc cu o anumită denumire

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

PanelSearch--search-field-hint = Știai că poți folosi virgula (,) ca să cauți folosind mai mulți termeni?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Editează denumirea profilului
ProfileName--edit-profile-name-input =
    .aria-label = Numele profilului
    .title = Editează denumirea profilului

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Șterge
    .title = Dă clic aici pentru ștergerea profilului { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = A apărut o eroare la ștergerea profilului. <a>Treci cu mouse-ul pe deasupra ca să afli mai multe.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Șterge { $profileName }
ProfileDeletePanel--dialog-confirmation-question =
    Sigur vrei să ștergi datele încărcate pentru acest profil? Linkurile
    partajate anterior nu vor mai funcționa.
ProfileDeletePanel--dialog-cancel-button =
    .value = Anulează
ProfileDeletePanel--dialog-delete-button =
    .value = Șterge
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Se șterge…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Datele încărcate au fost șterse cu succes.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Interval complet ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Se importă și se procesează profilul…
ProfileLoaderAnimation--loading-unpublished = Se importă profilul direct din { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Se citește fișierul și se procesează profilul…
ProfileLoaderAnimation--loading-local = Nu este încă implementat.
ProfileLoaderAnimation--loading-public = Se descarcă și se procesează profilul…
ProfileLoaderAnimation--loading-from-url = Se descarcă și se procesează profilul…

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Arbore de apelare

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
    .label = Putere
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Putere
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Putere
# This is used in the tooltip when the instant power value uses the microwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-microwatt = { $value } μW
    .label = Putere
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Putere medie în selecția curentă
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Putere medie în selecția curentă
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Putere medie în selecția curentă
# This is used in the tooltip when the power value uses the microwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-microwatt = { $value } μW
    .label = Putere medie în selecția curentă
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energie utilizată în intervalul vizibil
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energie utilizată în intervalul vizibil
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energie utilizată în intervalul vizibil
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energie utilizată în intervalul vizibil
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energie utilizată în selecția curentă
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energie utilizată în selecția curentă
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energie utilizată în selecția curentă
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energie utilizată în selecția curentă

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
TrackBandwidthGraph--speed = { $value } pe secundă
    .label = Viteză de transfer pentru acest eșantion
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = operații de citire/scriere de la eșantionul anterior
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Date transferate până la acest moment
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Date transferate în intervalul vizibil
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = Date transferate în selecția curentă

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Introdu termenii de filtrare
    .title = Afișează numai pistele care corespund unui anumit text

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
TransformNavigator--complete = Completează „{ $item }”
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Restrânge: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Nod de focalizare: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Focalizare: { $item }
# "Focus self" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-on-function-self
# Also see the translation note above CallNodeContextMenu--transform-focus-self.
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-self = Focalizare pe proprii: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Categorie de focalizare: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Îmbină nodul: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Îmbină: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Ignoră: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Restrânge recursivitatea: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Restrânge numai recursivitatea directă: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Restrânge sub-arborele: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Ignoră eșantioanele din afara marcajelor care corespund: „{ $item }”

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Se așteaptă { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Se așteaptă { -firefox-brand-name }…
