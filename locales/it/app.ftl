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
CallNodeContextMenu--transform-focus-function = Focus sulla funzione
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Focus sulla funzione (invertita)
    .title = { CallNodeContextMenu--transform-focus-function-title }
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

CompareHome--form-label-profile1 = Profile 1:
CompareHome--form-label-profile2 = Profile 2:
CompareHome--submit-button =
    .value = Recupera profili

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


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

## Home page

Home--upload-from-file-input-button = Carica un profilo da file
Home--upload-from-url-button = Carica un profilo da un URL
Home--load-from-url-submit-button =
    .value = Carica
Home--documentation-button = Documentazione
Home--menu-button = Attiva il pulsante { -profiler-brand-name } nel menu
Home--addon-button = Installa componente aggiuntivo
Home--instructions-title = Come visualizzare e registrare profili
Home--record-instructions-start-stop = Interrompi e avvia la profilatura
Home--record-instructions-capture-load = Cattura e carica profilo
Home--profiler-motto = Cattura un profilo delle prestazioni. Analizzalo. Condividilo. Rendi il Web più veloce.
Home--additional-content-title = Carica profili esistenti
Home--compare-recordings-info = È anche possibile confrontare registrazioni. <a>Apri l'interfaccia per il confronto</a>.
Home--recent-uploaded-recordings-title = Registrazioni caricate di recente

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Inserisci i termini da cercare

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


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

MarkerContextMenu--start-selection-here = Inizia la selezione qui
MarkerContextMenu--end-selection-here = Termina la selezione qui
MarkerContextMenu--copy-description = Copia descrizione
MarkerContextMenu--copy-call-stack = Copia stack di chiamata
MarkerContextMenu--copy-url = Copia URL
MarkerContextMenu--copy-full-payload = Copia payload completo

## MarkerSettings
## This is used in all panels related to markers.


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
MenuButtons--metaInfo--buffer-duration-unlimited = Illimitata
MenuButtons--metaInfo--application = Applicazione
MenuButtons--metaInfo--name-and-version = Nome e versione:
MenuButtons--metaInfo--update-channel = Canale di aggiornamento:
MenuButtons--metaInfo--build-id = ID build:
MenuButtons--metaInfo--build-type = Tipo di build:
MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt
MenuButtons--metaInfo--platform = Piattaforma
MenuButtons--metaInfo--device = Dispositivo:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = Sistema operativo:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Metriche visive
MenuButtons--metaInfo--speed-index = Indice di velocità:
MenuButtons--metaInfo--perceptual-speed-index = Indice di velocità percettiva:
MenuButtons--metaInfo--contentful-speed-Index = Indice di velocità contenuti:
MenuButtons--metaInfo-renderRowOfList-label-features = Caratteristiche:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Filtro thread:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Estensioni:
MenuButtons--metaOverheadStatistics-subtitle = Strumentazione profiler
MenuButtons--metaOverheadStatistics-mean = Media
MenuButtons--metaOverheadStatistics-max = Max
MenuButtons--metaOverheadStatistics-min = Min
MenuButtons--metaOverheadStatistics-statkeys-overhead = Strumentazione
MenuButtons--metaOverheadStatistics-statkeys-counter = Contatore
MenuButtons--metaOverheadStatistics-statkeys-interval = Intervallo

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Includi thread nascosti
MenuButtons--publish--renderCheckbox-label-hidden-time = Includi intervallo di tempo nascosto
MenuButtons--publish--renderCheckbox-label-include-screenshots = Includi screenshot
MenuButtons--publish--renderCheckbox-label-resource = Includi URL e percorsi delle risorse
MenuButtons--publish--renderCheckbox-label-extension = Includi informazioni sull’estensione
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


## PanelSearch
## The component that is used for all the search input hints in the application.


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

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.


## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.


## Tab Bar for the bottom half of the analysis UI.


## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.


## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Registrazioni caricate
