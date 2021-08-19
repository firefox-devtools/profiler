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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> – <subheader>Web-app voor prestatieanalyse van { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Naar onze Git-repository (deze wordt in een nieuw venster geopend)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = Kan het profiel niet ophalen van { -firefox-brand-name }.
AppViewRouter--error-message-from-file =
    .message = Kan het bestand niet lezen of het profiel erin ontleden.
AppViewRouter--error-message-local =
    .message = Nog niet geïmplementeerd.
AppViewRouter--error-message-public =
    .message = Kan het profiel niet downloaden.
AppViewRouter--error-message-from-url =
    .message = Kan het profiel niet downloaden.
AppViewRouter--route-not-found--home =
    .specialMessage = De URL die u probeerde te bereiken, werd niet herkend.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = Functie samenvoegen
    .title =
        Als u een functie samenvoegt, wordt deze uit het profiel verwijderd en wordt de tijd toegewezen aan
        de functie die deze heeft aangeroepen. Dit gebeurt overal waar de functie
        in de boom was aangeroepen.
CallNodeContextMenu--transform-merge-call-node = Alleen node samenvoegen
    .title =
        Als u een node samenvoegt, wordt deze uit het profiel verwijderd en de tijd toegewezen aan de
        functienode die deze heeft aangeroepen. Het verwijdert de functie alleen van dat
        specifieke deel van de boom. Overige plaatsen vanwaaruit de functie was aangeroepen
        blijven in het profiel.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Als u focust op een functie, wordt elk voorbeeld dat die functie niet bevat
    verwijderd. Daarbij wordt de aanroepboom opnieuw geroot, zodat de functie
    de enige root van de boom is. Dit kan meerdere functie-aanroepsites in een profiel
    combineren in één aanroepnode.
CallNodeContextMenu--transform-focus-function = Focussen op functie
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Focussen op functie (omgekeerd)
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = Alleen focussen op substructuur
    .title =
        Als u op een substructuur focust, wordt elk voorbeeld dat dat specifieke deel
        van de aanroepboom niet bevat verwijderd. Het selecteert een tak van de aanroepboom,
        echter dit gebeurt alleen voor die enkele aanroepnode. Alle andere aanroepen
        van de functie worden genegeerd.
CallNodeContextMenu--transform-collapse-function-subtree = Functie samenvouwen
    .title =
        Als u een functie samenvouwt, wordt alles dat deze heeft aangeroepen verwijderd en alle
        tijd aan de functie toegewezen. Dit kan helpen een profiel dat code aanroept die niet
        hoeft te worden geanalyseerd te vereenvoudigen.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = <strong>{ $nameForResource }</strong> samenvouwen
    .title =
        Als u een bron samenvouwt, worden alle aanroepen van die bron
        afgevlakt tot een enkele samengevouwen aanroepnode.
CallNodeContextMenu--transform-collapse-direct-recursion = Directe recursie samenvouwen
    .title =
        Als u directe recursie samenvouwt, worden alle aanroepen die herhaaldelijk naar
        dezelfde functie terugvallen verwijderd.
CallNodeContextMenu--transform-drop-function = Monsters met deze functie weglaten
    .title =
        Als u monsters weglaat, wordt hun tijd uit het profiel verwijderd. Dit is nuttig om
        tijdsinformatie die niet relevant voor de analyse is te elimineren.
CallNodeContextMenu--expand-all = Alles uitbreiden
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = De functienaam op Searchfox opzoeken
CallNodeContextMenu--copy-function-name = Functienaam kopiëren
CallNodeContextMenu--copy-script-url = Script-URL kopiëren
CallNodeContextMenu--copy-stack = Stack kopiëren

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Looptijd (ms)
    .title =
        De ‘totale’ looptijd bevat een samenvatting van alle tijd waarin deze
        functie zich on de stack bevond. Dit omvat de tijd waarin de
        functie daadwerkelijk werd uitgevoerd en de tijd die werd gespendeerd
        aan aanroepen vanuit deze functie.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Selecteer een node om informatie erover te tonen.

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Voer de profiel-URL’s die u wilt vergelijken in
CompareHome--instruction-content =
    Het hulpmiddel extraheert de gegevens uit de geselecteerde track en het bereik voor
    elk profiel en plaatst ze samen in dezelfde weergave, om ze gemakkelijk te
    vergelijken te maken.
CompareHome--form-label-profile1 = Profiel 1:
CompareHome--form-label-profile2 = Profiel 2:
CompareHome--submit-button =
    .value = Profielen ophalen

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Dit profiel is opgenomen in een build zonder uitgave-optimalisaties.
        Prestatiewaarnemingen zijn mogelijk niet van toepassing op de uitgavepopulatie.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = De zijbalk openen
Details--close-sidebar-button =
    .title = De zijbalk sluiten
Details--error-boundary-message =
    .message = Oh-oh, er is een onbekende fout in dit paneel opgetreden.

## Footer Links

FooterLinks--legal = Juridisch
FooterLinks--Privacy = Privacy
FooterLinks--Cookies = Cookies

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Grafiektype:
FullTimeline--categories-with-cpu = Categorieën met CPU
FullTimeline--categories = Categorieën
FullTimeline--stack-height = Stackhoogte
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> tracks zichtbaar

## Home page

Home--upload-from-file-input-button = Een profiel uit een bestand laden
Home--upload-from-url-button = Een profiel van een URL laden
Home--load-from-url-submit-button =
    .value = Laden
Home--documentation-button = Documentatie
Home--menu-button = Menuknop { -profiler-brand-name } inschakelen
Home--instructions-title = Profielen bekijken en opnemen
Home--instructions-content =
    Het opnemen van prestatieprofielen vereist <a>{ -firefox-brand-name }</a>.
    Bestaande profielen kunnen echter bekeken worden in elke moderne browser.
Home--record-instructions-start-stop = Profileren stoppen en starten
Home--additional-content-title = Bestaande profielen laden
Home--additional-content-content = U kunt een profielbestand hierheen <strong>verslepen</strong> om het te laden, of:
Home--compare-recordings-info = U kunt ook opnamen vergelijken. <a>De vergelijkingsinterface openen.</a>
Home--recent-uploaded-recordings-title = Onlangs geüploade opnamen

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Voer filtertermen in

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Klik hier om profiel { $smallProfileName } te laden
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Verwijderen
    .title = Dit profiel kan niet worden verwijderd, omdat we geen autorisatiegegevens hebben.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Er is nog geen profiel geüpload!
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Al uw opnamen bekijken en beheren (nog { $profilesRestCount })
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Deze opname beheren
       *[other] Deze opnamen beheren
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--start-selection-here = Selectie hier starten
MarkerContextMenu--end-selection-here = Selectie hier beëindigen
MarkerContextMenu--copy-description = Beschrijving kopiëren
MarkerContextMenu--copy-call-stack = Aanroepstack kopiëren
MarkerContextMenu--copy-url = URL kopiëren

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Start
MarkerTable--duration = Duur
MarkerTable--type = Type
MarkerTable--description = Beschrijving

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Profielinfo
MenuButtons--index--full-view = Volledig beeld
MenuButtons--index--cancel-upload = Uploaden annuleren
MenuButtons--index--share-upload =
    .label = Lokaal profiel uploaden
MenuButtons--index--share-re-upload =
    .label = Opnieuw uploaden
MenuButtons--index--share-error-uploading =
    .label = Fout bij uploaden
MenuButtons--index--revert = Terug naar origineel profiel
MenuButtons--index--docs = Documenten
MenuButtons--permalink--button =
    .label = Permalink

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Geüpload:
MenuButtons--index--profile-info-uploaded-actions = Verwijderen
MenuButtons--index--metaInfo-subtitle = Profielinformatie
MenuButtons--metaInfo--symbols = Symbolen:
MenuButtons--metaInfo--cpu = CPU:
MenuButtons--metaInfo--recording-started = Opname gestart:

## Strings refer to specific types of builds, and should be kept in English.


##


## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.


## Publish panel
## These strings are used in the publishing panel.


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

StackSettings--call-tree-strategy-native-deallocations-sites = Deallocatie van websites
    .title = Samenvatting aan de hand van de gedealloceerde bytes geheugenruimte, per website waarvan de geheugenruimte was gedealloceerd.

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

