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

AppViewRouter--error-message-local =
    .message = Ainda não implementado.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--expand-all = Expandir tudo
CallNodeContextMenu--copy-function-name = Copiar nome da função
CallNodeContextMenu--copy-script-url = Copiar URL do script

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--form-label-profile1 = Profile 1:
CompareHome--form-label-profile2 = Profile 2:

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Abrir painel lateral
Details--close-sidebar-button =
    .title = Fechar painel lateral

## Footer Links

FooterLinks--legal = Jurídico
FooterLinks--Privacy = Privacidade
FooterLinks--Cookies = Cookies

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = Tipo de gráfico:
FullTimeline--categories-with-cpu = Categorias com CPU
FullTimeline--categories = Categorias
FullTimeline--stack-height = Altura da pilha

## Home page

Home--upload-from-file-input-button = Carregar um profile de arquivo
Home--upload-from-url-button = Carregar um profile de uma URL
Home--load-from-url-submit-button =
    .value = Carregar
Home--documentation-button = Documentação
Home--addon-button = Instalar extensão
Home--instructions-title = Como ver e gravar profiles
Home--record-instructions-start-stop = Interrompa e inicie a gravação de profile
Home--record-instructions-capture-load = Capture e carregue um profile

## IdleSearchField
## The component that is used for all the search inputs in the application.


## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

ListOfPublishedProfiles--published-profiles-delete-button-disabled = Excluir
    .title = Este profile não pode ser excluído por falta de informações de autorização.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Nenhum profile foi carregado ainda!
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Gerenciar esta gravação
       *[other] Gerenciar estas gravações
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--start-selection-here = Iniciar a seleção aqui
MarkerContextMenu--end-selection-here = Finalizar a seleção aqui
MarkerContextMenu--copy-description = Copiar descrição
MarkerContextMenu--copy-call-stack = Copiar pilha de chamadas
MarkerContextMenu--copy-url = Copiar URL

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Início
MarkerTable--duration = Duração
MarkerTable--type = Tipo
MarkerTable--description = Descrição

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Informações do profile
MenuButtons--index--full-view = Vista completa
MenuButtons--index--cancel-upload = Cancelar envio
MenuButtons--index--share-upload =
    .label = Enviar profile local
MenuButtons--index--share-re-upload =
    .label = Reenviar
MenuButtons--index--share-error-uploading =
    .label = Erro ao enviar
MenuButtons--index--revert = Reverter para o profile original

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Enviado:
MenuButtons--index--profile-info-uploaded-actions = Excluir
MenuButtons--index--metaInfo-subtitle = Informações do profile
MenuButtons--metaInfo--symbols = Símbolos:
MenuButtons--metaInfo--cpu = CPU:
MenuButtons--metaInfo--interval = Intervalo:
MenuButtons--metaInfo--profile-version = Versão do profile:
MenuButtons--metaInfo--buffer-capacity = Capacidade do buffer:
MenuButtons--metaInfo--buffer-duration = Duração do buffer:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } segundo
       *[other] { $configurationDuration } segundos
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Ilimitado
MenuButtons--metaInfo--application = Aplicação
MenuButtons--metaInfo--name-and-version = Nome e versão:
MenuButtons--metaInfo--update-channel = Canal de atualização:
MenuButtons--metaInfo--build-id = ID da compilação:
MenuButtons--metaInfo--build-type = Tipo de compilação:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug

##

MenuButtons--metaInfo--platform = Plataforma
MenuButtons--metaInfo--device = Dispositivo:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = Sistema operacional:
MenuButtons--metaInfo--visual-metrics = Métricas visuais
MenuButtons--metaInfo--speed-index = Índice de velocidade:
MenuButtons--metaInfo-renderRowOfList-label-features = Recursos:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = Filtro de threads:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Extensões:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = Sobrecarga do { -profiler-brand-short-name }
MenuButtons--metaOverheadStatistics-mean = Média
MenuButtons--metaOverheadStatistics-max = Máx
MenuButtons--metaOverheadStatistics-min = Mín
MenuButtons--metaOverheadStatistics-statkeys-overhead = Sobrecarga
    .title = Tempo para amostrar todos os threads.
MenuButtons--metaOverheadStatistics-statkeys-cleaning = Limpeza
    .title = Tempo para descartar dados expirados.
MenuButtons--metaOverheadStatistics-statkeys-counter = Contador
    .title = Tempo para acumular todos os contadores.
MenuButtons--metaOverheadStatistics-statkeys-interval = Intervalo
    .title = Intervalo observado entre duas amostragens.
MenuButtons--metaOverheadStatistics-statkeys-lockings = Bloqueios
    .title = Tempo para obter o bloqueio antes de amostrar.
MenuButtons--metaOverheadStatistics-overhead-duration = Durações de sobrecarga:
MenuButtons--metaOverheadStatistics-overhead-percentage = Porcentagem de sobrecarga:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Incluir threads ocultos
MenuButtons--publish--renderCheckbox-label-hidden-time = Incluir intervalo de tempo oculto
MenuButtons--publish--renderCheckbox-label-include-screenshots = Incluir capturas de tela
MenuButtons--publish--renderCheckbox-label-resource = Incluir URLs e caminhos de recursos
MenuButtons--publish--renderCheckbox-label-extension = Incluir informações da extensão
MenuButtons--publish--renderCheckbox-label-preference = Incluir valores de preferências
MenuButtons--publish--reupload-performance-profile = Reenviar profile de desempenho
MenuButtons--publish--share-performance-profile = Compartilhar profile de desempenho
MenuButtons--publish--info-description = Enviar seu profile e tornar acessível a qualquer pessoa que tenha o link.
MenuButtons--publish--info-description-default = Por padrão, seus dados pessoais são removidos.
MenuButtons--publish--info-description-firefox-nightly = Este profile é do { -firefox-nightly-brand-name }, portanto, por padrão, todas as informações são incluídas.
MenuButtons--publish--include-additional-data = Incluir dados adicionais que podem ser identificáveis
MenuButtons--publish--button-upload = Enviar
MenuButtons--publish--upload-title = Enviando profile…
MenuButtons--publish--cancel-upload = Cancelar envio
MenuButtons--publish--message-try-again = Tentar novamente
MenuButtons--publish--download = Baixar
MenuButtons--publish--compressing = Compactando…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrar redes:
    .title = Só exibir requisições de rede que correspondem a um determinado nome

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Você sabia que pode usar vírgula (,) para pesquisar usando vários termos?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Excluir
    .title = Clique aqui para excluir o profile { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = Intervalo completo

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = Importando o profile diretamente do { -firefox-brand-name }…
ProfileLoaderAnimation--loading-message-from-file =
    .message = Lendo o arquivo e processando o profile…
ProfileLoaderAnimation--loading-message-local =
    .message = Ainda não implementado.
ProfileLoaderAnimation--loading-message-public =
    .message = Baixando e processando o profile…
ProfileLoaderAnimation--loading-message-from-url =
    .message = Baixando e processando o profile…
ProfileLoaderAnimation--loading-message-compare =
    .message = Lendo e processando profiles…
ProfileLoaderAnimation--loading-message-view-not-found =
    .message = Vista não encontrada

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Voltar ao início

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = Instalando…
ServiceWorkerManager--pending-button = Aplicar e recarregar
ServiceWorkerManager--installed-button = Recarregar a aplicação
ServiceWorkerManager--updated-while-not-ready =
    Uma nova versão da aplicação foi aplicada antes desta página
    ter sido totalmente carregada. Pode não funcionar direito.
ServiceWorkerManager--new-version-is-ready = Uma nova versão da aplicação foi baixada e está pronta para uso.
ServiceWorkerManager--hide-notice-button =
    .title = Ocultar o aviso de recarga
    .aria-label = Ocultar o aviso de recarga

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = Todas as pilhas
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = Nativo

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

