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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Web app per l’analisi delle prestazioni  di { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Visita il nostro repository Git (il link verrà aperto in una nuova finestra)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = Impossibile recuperare il profilo da { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = Impossibile leggere il file o analizzare il profilo contenuto.
AppViewRouter--error-message-local =
    .message = Non ancora implementato.
AppViewRouter--error-message-public =
    .message = Impossibile scaricare il profilo.
AppViewRouter--error-message-from-url =
    .message = Impossibile scaricare il profilo.
AppViewRouter--route-not-found--home =
    .specialMessage = L’URL che hai cercato di raggiungere non è stato riconosciuto.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = Unisci funzione
    .title = Unendo una funzione (merge), questa verrà rimossa dal profilo, e il suo tempo di esecuzione verrà assegnato alla funzione chiamante. Questo avviene ovunque la funzione è stata chiamata nell’albero.
CallNodeContextMenu--transform-merge-call-node = Unisci solo il nodo
    .title = Unendo un nodo (merge), questo verrà rimosso dal profilo, e il suo tempo di esecuzione verrà assegnato al nodo di funzione chiamante. Questa operazione rimuove la funzione sono nella parte specifica dell’albero. Qualsiasi altro posto in cui la funzione viene chiamata rimarrà nel profilo.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title = Il focus su una funzione rimuoverà tutti i campioni che non includono quella funzione. In aggiunta, l’albero delle chiamate viene riorganizzato in modo che la funzione sia l’unico nodo radice dell’albero. Questo permette di combinare più siti di chiamata di una funzione attraverso il profilo in un unico nodo di chiamata.
CallNodeContextMenu--transform-focus-function = Focus sulla funzione
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Focus sulla funzione (invertita)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Focus solo sul sottoalbero
    .title = Il focus sul sottoalbero rimuoverà tutti i campioni che non includono quella specifica parte dell’albero delle chiamate. Estrae un ramo dell’albero, ma solo per quel singolo nodo di chiamata. Tutte le altre chiamate di quella funzione vengono ignorate.
CallNodeContextMenu--transform-collapse-function-subtree = Comprimi funzione
    .title = Comprimendo una funzione verrà rimosso tutto ciò che ha chiamato, e il tempo di esecuzione verrà assegnato alla funzione. Questo permette di semplificare un profilo con chiamate a codice che non deve essere analizzato.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Comprimi <strong>{ $nameForResource }</strong>
    .title = Comprimendo una risorsa, tutte le chiamate a quella risorsa verranno compresse in un singolo nodo di chiamata.
CallNodeContextMenu--transform-collapse-direct-recursion = Comprimi ricorsione diretta
    .title = Comprimendo la ricorsione diretta, verranno rimosse tutte le chiamate ricorsive a quella stessa funzione.
CallNodeContextMenu--transform-drop-function = Scarta campioni con questa funzione
    .title = Rimuovendo campioni, i tempi di esecuzione associati verranno rimossi dal profilo. Questo è utile per eliminare informazioni sui tempi che non sono rilevanti per l’analisi.
CallNodeContextMenu--expand-all = Espandi tutto
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Cerca la funzione in Searchfox
CallNodeContextMenu--copy-function-name = Copia nome della funzione
CallNodeContextMenu--copy-script-url = Copia URL dello script
CallNodeContextMenu--copy-stack = Copia stack

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

## Footer Links

FooterLinks--legal = Note legali
FooterLinks--Privacy = Informativa sulla privacy
FooterLinks--Cookies = Cookie

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Tipo di grafico:
FullTimeline--categories-with-cpu = Categorie con CPU
FullTimeline--categories = Categorie
FullTimeline--stack-height = Altezza stack
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> tracce visibili

## Home page

Home--upload-from-file-input-button = Carica profilo da file
Home--upload-from-url-button = Carica profilo da un URL
Home--load-from-url-submit-button =
    .value = Carica
Home--documentation-button = Documentazione
Home--menu-button = Attiva il pulsante { -profiler-brand-name } nel menu
Home--menu-button-instructions = Attiva il pulsante Profiler nel menu per avviare la registrazione di un profilo delle prestazioni di { -firefox-brand-name }, poi analizzalo e condividilo su profiler.firefox.com.
Home--addon-button = Installa componente aggiuntivo
Home--addon-button-instructions = Installa il componente aggiuntivo Gecko Profiler Add-on per avviare la registrazione di un profilo delle prestazioni di { -firefox-brand-name }, poi analizzalo e condividilo su profiler.firefox.com.
Home--record-instructions = Per avviare la profilazione, fai clic sul pulsante per avviare la registrazione oppure utilizza le scorciatoie da tastiera. L’icona diventa blu quando è attiva la registrazione di un profilo. Premi <kbd>Cattura</kbd> per caricare i dati su profiler.firefox.com.
Home--instructions-title = Come visualizzare e registrare profili
Home--instructions-content = La registrazione dei profili è possibile solo con <a>{ -firefox-brand-name }</a>. I profili esistenti possono essere visti con qualsiasi browser.
Home--record-instructions-start-stop = Interrompi e avvia la profilatura
Home--record-instructions-capture-load = Cattura e carica profilo
Home--profiler-motto = Cattura un profilo delle prestazioni. Analizzalo. Condividilo. Rendi il Web più veloce.
Home--additional-content-title = Carica profili esistenti
Home--additional-content-content = È possibile <strong>trascinare e rilasciare</strong> qui un profilo per caricarlo, oppure:
Home--compare-recordings-info = È anche possibile confrontare registrazioni. <a>Apri l’interfaccia per il confronto</a>.
Home--recent-uploaded-recordings-title = Registrazioni caricate di recente

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
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
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
MarkerContextMenu--copy-full-payload = Copia payload completo

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filtra marker:
    .title = Visualizza solo marker che corrispondono a un determinato nome

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
MenuButtons--metaInfo--cpu = CPU:
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } core fisico
       *[other] { $physicalCPUs } core fisici
    }, { $logicalCPUs ->
        [one] { $logicalCPUs } core logico
       *[other] { $logicalCPUs } core logici
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
MenuButtons--metaInfo--recording-started = Registrazione avviata:
MenuButtons--metaInfo--interval = Intervallo:
MenuButtons--metaInfo--profile-version = Versione profilo:
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
MenuButtons--metaInfo--update-channel = Canale di aggiornamento:
MenuButtons--metaInfo--build-id = ID build:
MenuButtons--metaInfo--build-type = Tipo di build:

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
MenuButtons--metaInfo--perceptual-speed-index = Indice di velocità percettiva:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Indice di velocità contenuti:
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
MenuButtons--metaOverheadStatistics-statkeys-lockings = Locking
    .title = Tempo utilizzato per acquisire il lock prima del campionamento.
MenuButtons--metaOverheadStatistics-overhead-duration = Durata complessiva overhead:
MenuButtons--metaOverheadStatistics-overhead-percentage = Percentuale overhead:
MenuButtons--metaOverheadStatistics-profiled-duration = Durata profilata:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Includi thread nascosti
MenuButtons--publish--renderCheckbox-label-hidden-time = Includi intervallo di tempo nascosto
MenuButtons--publish--renderCheckbox-label-include-screenshots = Includi screenshot
MenuButtons--publish--renderCheckbox-label-resource = Includi URL e percorsi delle risorse
MenuButtons--publish--renderCheckbox-label-extension = Includi informazioni sulle estensioni
MenuButtons--publish--renderCheckbox-label-preference = Includi valori delle impostazioni
MenuButtons--publish--reupload-performance-profile = Ricarica il profilo delle prestazioni
MenuButtons--publish--share-performance-profile = Condividi il profilo delle prestazioni
MenuButtons--publish--info-description = Carica il tuo profilo e rendilo accessibile a chiunque abbia il link.
MenuButtons--publish--info-description-default = Per impostazione predefinita, i tuoi dati personali vengono rimossi.
MenuButtons--publish--info-description-firefox-nightly = Questo profilo è stato generato in { -firefox-nightly-brand-name }, quindi per impostazione predefinita tutte le informazioni sono incluse.
MenuButtons--publish--include-additional-data = Includi dati aggiuntivi che potrebbero essere identificabili
MenuButtons--publish--button-upload = Carica
MenuButtons--publish--upload-title = Caricamento profilo in corso…
MenuButtons--publish--cancel-upload = Annulla caricamento
MenuButtons--publish--message-something-went-wrong = Uh, si è verificato un errore durante il caricamento del profilo.
MenuButtons--publish--message-try-again = Riprova
MenuButtons--publish--download = Scarica
MenuButtons--publish--compressing = Compressione in corso…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtra reti:
    .title = Mostra solo richieste di rete che corrispondono a un nome specifico

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Lo sapevi che è possibile utilizzare una virgola per separare più termini di ricerca?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Elimina
    .title = Fare click qui per eliminare il profilo { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Intervallo completo

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = Importazione del profilo direttamente da { -firefox-brand-name } in corso…
ProfileLoaderAnimation--loading-message-from-file =
    .message = Lettura del file e analisi del profilo in corso…
ProfileLoaderAnimation--loading-message-local =
    .message = Non ancora implementato.
ProfileLoaderAnimation--loading-message-public =
    .message = Download ed elaborazione del profilo in corso…
ProfileLoaderAnimation--loading-message-from-url =
    .message = Download ed elaborazione del profilo in corso…
ProfileLoaderAnimation--loading-message-compare =
    .message = Lettura e analisi del profilo in corso…
ProfileLoaderAnimation--loading-message-view-not-found =
    .message = Vista non trovata

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Ritorna alla pagina iniziale

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Installazione in corso…
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

StackSettings--implementation-all-stacks = Tutti gli stack
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Nativo
StackSettings--use-data-source-label = Sorgente dati:
StackSettings--call-tree-strategy-timing = Tempi
    .title = Sintetizza usando gli stack campionati del codice eseguito nel tempo
StackSettings--call-tree-strategy-js-allocations = Allocazioni JavaScript
    .title = Sintetizza usando i byte JavaScript allocati (ignora de-allocazioni)
StackSettings--call-tree-strategy-native-retained-allocations = Memoria mantenuta
    .title = Sintetizza usando i byte di memoria che sono stati allocati ma mai liberati nella selezione corrente di anteprima
StackSettings--call-tree-native-allocations = Memoria allocata
    .title = Sintetizza usando i byte di memoria allocata
StackSettings--call-tree-strategy-native-deallocations-memory = Deallocazione memoria
    .title = Sintetizza usando i byte di memoria deallocati, in base dal sito in cui la memoria è stata allocata
StackSettings--call-tree-strategy-native-deallocations-sites = Deallocazione siti
    .title = Sintetizza usando i byte di memoria deallocati, in base dal sito in cui la memoria è stata deallocata
StackSettings--invert-call-stack = Inverti stack di chiamata
    .title = Mostra solo il tempo trascorso in un nodo di chiamata, ignorando i nodi figlio.
StackSettings--show-user-timing = Mostra tempo utente
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

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = Mostra solo questo gruppo di processi
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

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Registrazioni caricate
