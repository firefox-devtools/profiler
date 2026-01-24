# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox per Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Web app per l’analisi delle prestazioni di { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Visita il nostro repository Git (il link verrà aperto in una nuova finestra)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Impossibile importare il profilo.
AppViewRouter--error-unpublished = Impossibile recuperare il profilo da { -firefox-brand-name }.
AppViewRouter--error-from-file = Impossibile leggere il file o analizzare il profilo in esso contenuto.
AppViewRouter--error-local = Non ancora implementato.
AppViewRouter--error-public = Impossibile scaricare il profilo.
AppViewRouter--error-from-url = Impossibile scaricare il profilo.
AppViewRouter--error-compare = Impossibile recuperare i profili.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari = A causa di una <a>limitazione specifica di Safari</a>, { -profiler-brand-name } non può importare profili dal dispositivo locale in questo browser. Aprire questa pagina in { -firefox-brand-name } o Chrome.
    .title = Impossibile importare profili locali in Safari
AppViewRouter--route-not-found--home =
    .specialMessage = L’URL che hai cercato di raggiungere non è stato riconosciuto.

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (incorporata)
    .title = { $function } è stata incorporata nel chiamante dal compilatore.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Mostra <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Unisci funzione
    .title = Unendo una funzione (merge), questa verrà rimossa dal profilo e il suo tempo di esecuzione verrà assegnato alla funzione chiamante. Questo avviene in qualsiasi punto dell’albero in cui la funzione viene chiamata.
CallNodeContextMenu--transform-merge-call-node = Unisci solo il nodo
    .title = Unendo un nodo (merge), questo verrà rimosso dal profilo e il suo tempo di esecuzione verrà assegnato al nodo di funzione chiamante. Questa operazione rimuove la funzione sono nella parte specifica dell’albero. Qualsiasi altra posizione in cui la funzione viene chiamata verrà mantenuta nel profilo.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title = Il focus su una funzione rimuove tutti i campioni che non includono quella funzione. L’albero delle chiamate viene anche riorganizzato in modo che la funzione sia l’unico nodo radice. Questo permette di combinare più siti di chiamata di una funzione attraverso il profilo in un unico nodo di chiamata.
CallNodeContextMenu--transform-focus-function = Focus sulla funzione
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Focus sulla funzione (invertito)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Focus solo sul sottoalbero
    .title = Il focus sul sottoalbero rimuoverà tutti i campioni che non includono quella specifica parte dell’albero delle chiamate. Estrae un ramo dell’albero, ma solo per quel singolo nodo di chiamata. Tutte le altre chiamate a quella funzione vengono ignorate.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Focus sulla categoria <strong>{ $categoryName }</strong>
    .title = Il focus verrà applicato ai nodi che appartengono alla stessa categoria del nodo selezionato. Tutti gli altri nodi che appartengono ad altre categorie verranno uniti.
CallNodeContextMenu--transform-collapse-function-subtree = Comprimi funzione
    .title = Comprimendo una funzione verrà rimosso tutto ciò che ha chiamato e il tempo di esecuzione verrà assegnato alla funzione stessa. Questo permette di semplificare un profilo con chiamate a codice che non deve essere analizzato.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Comprimi <strong>{ $nameForResource }</strong>
    .title = Comprimendo una risorsa, tutte le chiamate a quella risorsa verranno compresse in un singolo nodo di chiamata.
CallNodeContextMenu--transform-collapse-recursion = Comprimi ricorsione
    .title = Comprimendo la ricorsione verranno rimosse tutte le chiamate ricorsive a quella stessa funzione, anche con funzioni intermedie nello stack.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Comprimi solo ricorsione diretta
    .title = Comprimendo la ricorsione diretta verranno rimosse tutte le chiamate ricorsive a quella stessa funzione senza funzioni intermedie nello stack.
CallNodeContextMenu--transform-drop-function = Scarta campioni con questa funzione
    .title = Rimuovendo i campioni, i tempi di esecuzione associati verranno rimossi dal profilo. Questo è utile per eliminare informazioni sui tempi che non sono rilevanti per l’analisi.
CallNodeContextMenu--expand-all = Espandi tutto
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Cerca la funzione in Searchfox
CallNodeContextMenu--copy-function-name = Copia nome della funzione
CallNodeContextMenu--copy-script-url = Copia URL dello script
CallNodeContextMenu--copy-stack = Copia stack
CallNodeContextMenu--show-the-function-in-devtools = Mostra la funzione in DevTools

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Tempo di esecuzione (ms)
    .title = Il tempo di esecuzione “totale” include un sommario di tutto il tempo in cui questa funzione è stata rilevata sullo stack. Questo include il tempo in cui la funzione era effettivamente in esecuzione, ma anche il tempo trascorso nelle funzioni chiamate da questa funzione.
CallTree--tracing-ms-self = Self (ms)
    .title = Il tempo “self” include il tempo in cui la funzione si trovava alla fine dello stack. Se questa funzione ha chiamato altre funzioni, il tempo "altro" di queste funzioni non è incluso. Il tempo “self” è utile per capire dove il tempo viene realmente speso all’interno di un programma.
CallTree--samples-total = Totale (campioni)
    .title = Il conteggio “totale” dei campioni include un sommario di qualsiasi campione in cui questa funzione è stata osservata sullo stack. Questo include il tempo in cui la funzione era effettivamente in esecuzione, ma anche il tempo trascorso nelle funzioni chiamate da questa funzione.
CallTree--samples-self = Self
    .title = Il conteggio dei campioni “self” include tutti i campioni in cui la funzione si trovava alla fine dello stack. Se questa funzione ha chiamato altre funzioni, il conteggio "altro" di queste funzioni non è incluso. Il conteggio “self” è utile per capire dove il tempo viene realmente speso all’interno di un programma.
CallTree--bytes-total = Dimensione totale (byte)
    .title = La “dimensione totale“ include un sommario di tutti i byte allocati o deallocati quando questa funzione è stata osservata sullo stack. Questo include i byte consumati quando la funzione era effettivamente in esecuzione, ma anche il tempo trascorso nelle funzioni chiamate da questa funzione.
CallTree--bytes-self = Self (bytes)
    .title = “Self“ include i byte allocati o deallocati quando questa funzione si trovava alla fine dello stack. Se questa funzione ha chiamato altre funzioni, il conteggio dei byte "altro" di queste funzioni non è incluso. Il conteggio “self” è utile per capire come la memoria viene realmente allocata e deallocata all’interno di un programma.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Alcune chiamate a { $calledFunction } sono state incorporate dal compilatore.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (incorporata)
    .title = Le chiamate a { $calledFunction } sono state incorporate in { $outerFunction } dal compilatore.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Seleziona un nodo per visualizzare informazioni su di esso.
CallTreeSidebar--call-node-details = Dettagli nodo di chiamata

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
    .label = Tempo di esecuzione tracciato
CallTreeSidebar--traced-self-time =
    .label = Tempo nella funzione tracciato
CallTreeSidebar--running-time =
    .label = Tempo di esecuzione
CallTreeSidebar--self-time =
    .label = Tempo nella funzione
CallTreeSidebar--running-samples =
    .label = Campioni esecuzione
CallTreeSidebar--self-samples =
    .label = Campioni nella funzione
CallTreeSidebar--running-size =
    .label = Dimensioni esecuzione
CallTreeSidebar--self-size =
    .label = Dimensioni nella funzione
CallTreeSidebar--categories = Categorie
CallTreeSidebar--implementation = Implementazione
CallTreeSidebar--running-milliseconds = Esecuzione — Millisecondi
CallTreeSidebar--running-sample-count = Esecuzione — Numero campioni
CallTreeSidebar--running-bytes = Esecuzione — Byte
CallTreeSidebar--self-milliseconds = Nella funzione —  Millisecondi
CallTreeSidebar--self-sample-count = Nella funzione —  Numero campioni
CallTreeSidebar--self-bytes = Nella funzione —  Byte

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Inserire gli URL dei profili che si vogliono confrontare
CompareHome--instruction-content = Questo strumento estrarrà i dati dalla traccia e dall’intervallo selezionati per ciascuno profilo, e li posizionerà nella stessa vista per rendere il confronto più semplice.
CompareHome--form-label-profile1 = Profilo 1:
CompareHome--form-label-profile2 = Profilo 2:
CompareHome--submit-button =
    .value = Carica profili

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message = Questo profilo è stato registrato con una build priva delle ottimizzazioni usate in release. L’osservazione delle prestazioni potrebbe non essere applicabile agli utenti in release.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Apri la barra laterale
Details--close-sidebar-button =
    .title = Chiudi la barra laterale
Details--error-boundary-message =
    .message = Uh, si è verificato un errore sconosciuto in questo pannello.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description = Segnalare questo problema agli sviluppatori, includendo l’errore completo come visualizzato nella Console web degli strumenti di sviluppo.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Segnala l’errore su GitHub

## Footer Links

FooterLinks--legal = Note legali
FooterLinks--Privacy = Informativa sulla privacy
FooterLinks--Cookies = Cookie
FooterLinks--languageSwitcher--select =
    .title = Cambia lingua
FooterLinks--hide-button =
    .title = Nascondi collegamenti a piè di pagina
    .aria-label = Nascondi collegamenti a piè di pagina

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> tracce

## Home page

Home--upload-from-file-input-button = Carica profilo da file
Home--upload-from-url-button = Carica profilo da URL
Home--load-from-url-submit-button =
    .value = Carica
Home--documentation-button = Documentazione
Home--menu-button = Attiva il pulsante { -profiler-brand-name } nel menu
Home--menu-button-instructions = Attiva il pulsante Profiler nel menu per avviare la registrazione di un profilo delle prestazioni di { -firefox-brand-name }, poi analizzalo e condividilo su profiler.firefox.com.
Home--profile-firefox-android-instructions = È anche possibile creare profili per { -firefox-android-brand-name }. Per ulteriori informazioni, consultare la documentazione <a>Creare un profilo di { -firefox-android-brand-name } direttamente sul dispositivo</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Questa istanza del profiler non è stata in grado di connettersi al WebChannel e quindi non può attivare il pulsante del profiler nel menu.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = Questa istanza del profiler non è stata in grado di connettersi al WebChannel. Normalmente significa che è in esecuzione su un host diverso da quello specificato nell’impostazione <code>devtools.performance.recording.ui-base-url</code>. Se vuoi catturare nuovi profili con questa istanza e assegnarle il controllo programmatico del pulsante del menu del profiler, apri <code>about:config</code> e modifica questa impostazione.
Home--record-instructions = Per avviare la profilazione, fai clic sul pulsante per avviare la registrazione oppure utilizza le scorciatoie da tastiera. L’icona diventa blu quando è attiva la registrazione di un profilo. Premi <kbd>Cattura</kbd> per caricare i dati su profiler.firefox.com.
Home--instructions-content = La registrazione dei profili è possibile solo con <a>{ -firefox-brand-name }</a>. I profili esistenti possono essere visualizzati con qualsiasi browser.
Home--record-instructions-start-stop = Interrompi e avvia la profilatura
Home--record-instructions-capture-load = Cattura e carica profilo
Home--profiler-motto = Cattura un profilo delle prestazioni. Analizzalo. Condividilo. Rendi il Web più veloce.
Home--additional-content-title = Carica profili esistenti
Home--additional-content-content = È possibile <strong>trascinare e rilasciare</strong> qui un profilo per caricarlo, oppure:
Home--compare-recordings-info = È anche possibile confrontare diverse registrazioni. <a>Apri l’interfaccia per il confronto</a>.
Home--your-recent-uploaded-recordings-title = Le tue registrazioni caricate di recente
Home--dark-mode-title = Modalità scura
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } può anche importare profili da altri profiler, come <perf>Linux perf</perf>, <simpleperf>Android SimplePerf</simpleperf>, il
    pannello prestazioni di Chrome, <androidstudio>Android Studio</androidstudio> o qualsiasi file che utilizzi il <dhat>formato dhat</dhat> o <traceevent>Trace Event di Google</traceevent>. <write>Scopri come creare uno strumento di importazione</write>.
Home--install-chrome-extension = Installa l’estensione per Chrome
Home--chrome-extension-instructions = Utilizza l’estensione <a>{ -profiler-brand-name } per Chrome</a> per acquisire i profili delle prestazioni in Chrome e analizzarli in { -profiler-brand-name }. Installa l’estensione dal Chrome Web Store.
Home--chrome-extension-recording-instructions = Una volta installata, utilizza l’icona dell’estensione nella barra degli strumenti o le scorciatoie per avviare e interrompere la profilazione. Puoi anche esportare i profili e caricarli qui per un’analisi dettagliata.

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Inserisci i termini da cercare

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Mostra solo “self time’”
    .title = Mostra solo il tempo trascorso in un nodo di chiamata, ignorando i nodi figlio.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Fare clic qui per caricare il profilo { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Elimina
    .title = Non è possibile eliminare questo profilo in quanto mancano le informazioni di autorizzazione.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Non è stato ancora caricato alcun profilo.
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label =
    { $profilesRestCount ->
        [one] Visualizza e gestisci tutte le tue registrazioni ({ $profilesRestCount } altra)
       *[other] Visualizza e gestisci tutte le tue registrazioni (altre { $profilesRestCount })
    }
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Gestisci questa registrazione
       *[other] Gestisci queste registrazioni
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Imposta selezione in base alla durata del marker
MarkerContextMenu--start-selection-here = Inizia la selezione qui
MarkerContextMenu--end-selection-here = Termina la selezione qui
MarkerContextMenu--start-selection-at-marker-start = Inizia selezione all’<strong>inizio</strong> del marker
MarkerContextMenu--start-selection-at-marker-end = Inizia selezione alla <strong>fine</strong> del marker
MarkerContextMenu--end-selection-at-marker-start = Termina selezione all’<strong>inizio</strong> del marker
MarkerContextMenu--end-selection-at-marker-end = Termina selezione alla <strong>fine</strong> del marker
MarkerContextMenu--copy-description = Copia descrizione
MarkerContextMenu--copy-call-stack = Copia stack di chiamata
MarkerContextMenu--copy-url = Copia URL
MarkerContextMenu--copy-page-url = Copia URL della pagina
MarkerContextMenu--copy-as-json = Copia come JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Seleziona il thread di destinazione “<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Seleziona il thread di origine “<strong>{ $threadName }</strong>”

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Scarta campioni al di fuori dei marker corrispondenti a “<strong>{ $filter }</strong>”

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = Copia tabella dei marker come testo normale
MarkerCopyTableContextMenu--copy-table-as-markdown = Copia tabella dei marker come Markdown

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filtra marker:
    .title = Visualizza solo marker che corrispondono a un determinato nome
MarkerSettings--marker-filters =
    .title = Filtri per i marker
MarkerSettings--copy-table =
    .title = Copia tabella come testo
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = Il numero di righe supera il limite: { $rows } > { $maxRows }. Verranno copiate solo le prime { $maxRows } righe.

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Seleziona un marker per visualizzare informazioni su di esso.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Inizio
MarkerTable--duration = Durata
MarkerTable--name = Nome
MarkerTable--details = Dettagli

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = Mostra solo i marker corrispondenti a: “{ $filter }”
    .aria-label = Mostra solo i marker corrispondenti a: “{ $filter }”

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Informazioni profilo
MenuButtons--index--full-view = Vista completa
MenuButtons--index--cancel-upload = Annulla caricamento
MenuButtons--index--share-upload =
    .label = Carica profilo locale
MenuButtons--index--share-re-upload =
    .label = Carica di nuovo
MenuButtons--index--share-error-uploading =
    .label = Errore durante il caricamento
MenuButtons--index--revert = Ripristina profilo originale
MenuButtons--index--docs = Documentazione
MenuButtons--permalink--button =
    .label = Link permanente

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Caricato:
MenuButtons--index--profile-info-uploaded-actions = Elimina
MenuButtons--index--metaInfo-subtitle = Informazioni profilo
MenuButtons--metaInfo--symbols = Simboli:
MenuButtons--metaInfo--profile-symbolicated = Il profilo è simbolizzato
MenuButtons--metaInfo--profile-not-symbolicated = Il profilo non è simbolizzato
MenuButtons--metaInfo--resymbolicate-profile = Risimbolizza il profilo
MenuButtons--metaInfo--symbolicate-profile = Simbolizza il profilo
MenuButtons--metaInfo--attempting-resymbolicate = Tentativo di risimbolizzare il profilo
MenuButtons--metaInfo--currently-symbolicating = Profilo attualmente in fase di simbolizzazione
MenuButtons--metaInfo--cpu-model = Modello CPU:
MenuButtons--metaInfo--cpu-cores = Core della CPU:
MenuButtons--metaInfo--main-memory = Memoria principale:
MenuButtons--index--show-moreInfo-button = Mostra dettagli
MenuButtons--index--hide-moreInfo-button = Nascondi dettagli
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } core fisico, { $logicalCPUs } core logico
               *[other] { $physicalCPUs } core fisico, { $logicalCPUs } core logici
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } core fisici, { $logicalCPUs } core logico
               *[other] { $physicalCPUs } core fisici, { $logicalCPUs } core logici
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } core fisico
       *[other] { $physicalCPUs } core fisici
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } core logico
       *[other] { $logicalCPUs } core logici
    }
MenuButtons--metaInfo--profiling-started = Registrazione avviata:
MenuButtons--metaInfo--profiling-session = Lunghezza registrazione:
MenuButtons--metaInfo--main-process-started = Processo principale avviato:
MenuButtons--metaInfo--main-process-ended = Processo principale completato:
MenuButtons--metaInfo--file-name = Nome file:
MenuButtons--metaInfo--file-size = Dimensione file:
MenuButtons--metaInfo--interval = Intervallo:
MenuButtons--metaInfo--buffer-capacity = Capacità buffer:
MenuButtons--metaInfo--buffer-duration = Durata buffer:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } secondo
       *[other] { $configurationDuration } secondi
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Illimitata
MenuButtons--metaInfo--application = Applicazione
MenuButtons--metaInfo--name-and-version = Nome e versione:
MenuButtons--metaInfo--application-uptime = Tempo di attività:
MenuButtons--metaInfo--update-channel = Canale di aggiornamento:
MenuButtons--metaInfo--build-id = ID build:
MenuButtons--metaInfo--build-type = Tipo di build:
MenuButtons--metaInfo--arguments = Argomenti:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Piattaforma
MenuButtons--metaInfo--device = Dispositivo:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = Sistema operativo:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Metriche visive
MenuButtons--metaInfo--speed-index = Indice di velocità:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Indice “Perceptual Speed":
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Indice “Contentful Speed”:
MenuButtons--metaInfo-renderRowOfList-label-features = Caratteristiche:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Filtro thread:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Estensioni:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Risorse aggiuntive (overhead) { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Media
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Overhead
    .title = Tempo utilizzato per campionare tutti i thread.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Pulizia
    .title = Tempo utilizzato per rimuovere i dati scaduti.
MenuButtons--metaOverheadStatistics-statkeys-counter = Contatore
    .title = Tempo utilizzato per raccogliere tutti i contatori.
MenuButtons--metaOverheadStatistics-statkeys-interval = Intervallo
    .title = Intervallo rispettato tra due campioni.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Locking
    .title = Tempo utilizzato per acquisire il lock prima del campionamento.
MenuButtons--metaOverheadStatistics-overhead-duration = Durata complessiva overhead:
MenuButtons--metaOverheadStatistics-overhead-percentage = Percentuale overhead:
MenuButtons--metaOverheadStatistics-profiled-duration = Durata profilata:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Includi thread nascosti
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Includi dati di altre schede
MenuButtons--publish--renderCheckbox-label-hidden-time = Includi intervallo di tempo nascosto
MenuButtons--publish--renderCheckbox-label-include-screenshots = Includi screenshot
MenuButtons--publish--renderCheckbox-label-resource = Includi URL e percorsi delle risorse
MenuButtons--publish--renderCheckbox-label-extension = Includi informazioni sulle estensioni
MenuButtons--publish--renderCheckbox-label-preference = Includi valori delle impostazioni
MenuButtons--publish--renderCheckbox-label-private-browsing = Includi i dati dalle finestre di navigazione anonima
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Questo profilo contiene dati di navigazione anonima
MenuButtons--publish--reupload-performance-profile = Ricarica il profilo delle prestazioni
MenuButtons--publish--share-performance-profile = Condividi il profilo delle prestazioni
MenuButtons--publish--info-description = Carica il tuo profilo e rendilo accessibile a chiunque abbia il link.
MenuButtons--publish--info-description-default = Per impostazione predefinita, i tuoi dati personali vengono rimossi.
MenuButtons--publish--info-description-firefox-nightly2 = Questo profilo è stato generato in { -firefox-nightly-brand-name }, quindi per impostazione predefinita la maggior parte delle informazioni è inclusa.
MenuButtons--publish--include-additional-data = Includi dati aggiuntivi che potrebbero essere identificabili
MenuButtons--publish--button-upload = Carica
MenuButtons--publish--upload-title = Caricamento profilo in corso…
MenuButtons--publish--cancel-upload = Annulla caricamento
MenuButtons--publish--message-something-went-wrong = Uh, si è verificato un errore durante il caricamento del profilo.
MenuButtons--publish--message-try-again = Riprova
MenuButtons--publish--download = Scarica
MenuButtons--publish--compressing = Compressione in corso…
MenuButtons--publish--error-while-compressing = Errore durante la compressione, prova a deselezionare alcune caselle di controllo per ridurre le dimensioni del profilo.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtra reti:
    .title = Mostra solo richieste di rete che corrispondono a un nome specifico

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

PanelSearch--search-field-hint = Lo sapevi che è possibile utilizzare una virgola per separare più termini di ricerca?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Modifica nome del profilo
ProfileName--edit-profile-name-input =
    .title = Modifica nome del profilo
    .aria-label = Nome del profilo

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Elimina
    .title = Fare clic qui per eliminare il profilo { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Si è verificato un errore durante l’eliminazione di questo profilo. <a>Posiziona qui il puntatore del mouse per ulteriori informazioni.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Elimina “{ $profileName }”
ProfileDeletePanel--dialog-confirmation-question = Eliminare tutti i dati per questo profilo? I link condivisi in passato non funzioneranno più.
ProfileDeletePanel--dialog-cancel-button =
    .value = Annulla
ProfileDeletePanel--dialog-delete-button =
    .value = Elimina
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Eliminazione in corso…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = I dati caricati sono stati eliminati correttamente.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Intervallo completo ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Importazione ed elaborazione del profilo in corso…
ProfileLoaderAnimation--loading-unpublished = Importazione del profilo direttamente da { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Lettura del file e analisi del profilo…
ProfileLoaderAnimation--loading-local = Non ancora implementato.
ProfileLoaderAnimation--loading-public = Download ed elaborazione del profilo in corso…
ProfileLoaderAnimation--loading-from-url = Download ed elaborazione del profilo in corso…
ProfileLoaderAnimation--loading-compare = Lettura e analisi del profilo in corso…
ProfileLoaderAnimation--loading-view-not-found = Vista non trovata

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Ritorna alla pagina iniziale

## Root

Root--error-boundary-message =
    .message = Uh, si è verificato un errore sconosciuto in profiler.firefox.com.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Applicazione in corso…
ServiceWorkerManager--pending-button = Applica e ricarica
ServiceWorkerManager--installed-button = Ricarica l’applicazione
ServiceWorkerManager--updated-while-not-ready = È stata applicata una nuova versione dell’applicazione prima che la pagina fosse completamente caricata. Potrebbero verificarsi dei malfunzionamenti.
ServiceWorkerManager--new-version-is-ready = È stata scaricata una nuova versione dell’applicazione ed è pronta per l’uso.
ServiceWorkerManager--hide-notice-button =
    .title = Nascondi l’avviso di ricarica
    .aria-label = Nascondi l’avviso di ricarica

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-frames = Tutti i frame
    .title = Non filtrare gli stack frame
StackSettings--implementation-script = Script
    .title = Mostra solo gli stack frame relativi all’esecuzione di script
StackSettings--implementation-native2 = Nativo
    .title = Mostra solo gli stack frame per il codice nativo
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Filtra stack:
StackSettings--use-data-source-label = Sorgente dati:
StackSettings--call-tree-strategy-timing = Tempi
    .title = Sintetizza usando gli stack campionati del codice eseguito nel tempo
StackSettings--call-tree-strategy-js-allocations = Allocazioni JavaScript
    .title = Sintetizza usando i byte JavaScript allocati (ignora deallocazioni)
StackSettings--call-tree-strategy-native-retained-allocations = Memoria mantenuta
    .title = Sintetizza usando i byte di memoria che sono stati allocati ma mai liberati nella selezione corrente di anteprima
StackSettings--call-tree-native-allocations = Memoria allocata
    .title = Sintetizza usando i byte di memoria allocata
StackSettings--call-tree-strategy-native-deallocations-memory = Deallocazione memoria
    .title = Sintetizza usando i byte di memoria deallocati, in base dal sito in cui la memoria è stata allocata
StackSettings--call-tree-strategy-native-deallocations-sites = Deallocazione siti
    .title = Sintetizza usando i byte di memoria deallocati, in base dal sito in cui la memoria è stata deallocata
StackSettings--invert-call-stack = Inverti stack di chiamata
    .title = Ordina in base al tempo trascorso in un nodo di chiamata, ignorando i nodi figlio.
StackSettings--show-user-timing = Mostra tempo utente
StackSettings--use-stack-chart-same-widths = Utilizza la stessa larghezza per ogni stack
StackSettings--panel-search =
    .label = Filtra stack:
    .title = Mostra solo stack che contengono una funzione il cui nome corrisponde a questa sottostringa

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Albero delle chiamate
TabBar--flame-graph-tab = Grafico a fiamma
TabBar--stack-chart-tab = Grafico a pila
TabBar--marker-chart-tab = Grafico a marker
TabBar--marker-table-tab = Tabella marker
TabBar--network-tab = Rete
TabBar--js-tracer-tab = Tracer JS

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Tutte le schede e le finestre

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Mostra solo questo processo
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Mostra solo “{ $trackName } ”
TrackContextMenu--hide-other-screenshots-tracks = Nascondi altre tracce Screenshots
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Nascondi “{ $trackName } ”
TrackContextMenu--show-all-tracks = Mostra tutte le tracce
TrackContextMenu--show-local-tracks-in-process = Mostra tutte le tracce in questo processo
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Nascondi tutte le tracce di tipo “{ $type }”
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Mostra tutte le tracce corrispondenti
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Nascondi tutte le tracce corrispondenti
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Nessun risultato trovato per “<span>{ $searchFilter }</span>”
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Nascondi traccia
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Nascondi processo

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = memoria relativa al momento
TrackMemoryGraph--memory-range-in-graph = intervallo di memoria nel grafico
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = allocazioni e deallocazioni dal campione precedente

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
    .label = Consumo
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Consumo
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Consumo
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Consumo medio nella selezione corrente
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Consumo medio nella selezione corrente
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Consumo medio nella selezione corrente
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energia utilizzata nell’intervallo visibile
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energia utilizzata nell’intervallo visibile
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energia utilizzata nell’intervallo visibile
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energia utilizzata nell’intervallo visibile
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energia utilizzata nella selezione corrente
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energia utilizzata nella selezione corrente
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energia utilizzata nella selezione corrente
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energia utilizzata nella selezione corrente

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
TrackBandwidthGraph--speed = { $value } al secondo
    .label = Velocità di trasferimento per questo campione
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = Operazioni di lettura/scrittura dal campione precedente
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Dati trasferiti fino a questo momento
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Dati trasferiti nell’intervallo visibile
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = Dati trasferiti nella selezione corrente

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Inserisci i termini da cercare
    .title = Mostra solo le tracce che contengono un testo specifico

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
TransformNavigator--complete = “{ $item }” completo
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = Comprimi: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Focus sul nodo: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Focus: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Focus sulla categoria: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Unisci nodo: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Unisci: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Scarta: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Comprimi ricorsione: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Comprimi solo ricorsione diretta: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Comprimi sottoalbero: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Scarta campioni al di fuori dei marker corrispondenti: “{ $item }”

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = In attesa di { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = In attesa di { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Codice sorgente non disponibile
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Vedi <a>issue #3741</a> per gli scenari supportati e i miglioramenti in programma.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Codice assembly non disponibile
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Vedi <a>issue #4520</a> per gli scenari supportati e i miglioramenti in programma.
SourceView--close-button =
    .title = Chiudi la vista sorgente

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Per questo file non è disponibile alcun URL cross-origin accessibile.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Si è verificato un errore di rete durante il recupero dell’URL { $url }: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Impossibile interrogare l’API di simbolizzazione del browser: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = L’API di simbolizzazione del browser ha restituito un errore: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = L’API di simbolizzazione del server locale per i simboli ha restituito un errore: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = L”API di simbolizzazione del browser ha restituito una risposta non valida: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = L’API di simbolizzazione del server locale dei simboli ha restituito una risposta non valida: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = Il file { $pathInArchive } non è stato trovato nell’archivio da { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = Impossibile analizzare l’archivio in { $url }: { $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = Il browser non è riuscito a ottenere il file sorgente per { $url } con sourceUuid { $sourceUuid }: { $errorMessage }.

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Mostra la vista assembly
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Nascondi la vista assembly
# The "◀" button above the assembly view.
AssemblyView--prev-button =
    .title = Precedente
# The "▶" button above the assembly view.
AssemblyView--next-button =
    .title = Successivo
# The label showing the current position and total count above the assembly view.
# Variables:
#   $current (Number) - The current position (1-indexed).
#   $total (Number) - The total count.
AssemblyView--position-label = { $current } di { $total }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Registrazioni caricate
