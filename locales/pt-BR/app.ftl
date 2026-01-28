# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox para Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Aplicativo web para análise de desempenho do { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Ir para nosso repositório Git (é aberto em uma nova janela)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Não foi possível importar o profile.
AppViewRouter--error-unpublished = Não foi possível recuperar o profile do { -firefox-brand-name }.
AppViewRouter--error-from-file = Não foi possível ler o arquivo ou analisar o profile dele.
AppViewRouter--error-local = Ainda não implementado.
AppViewRouter--error-public = Não foi possível baixar o profile.
AppViewRouter--error-from-url = Não foi possível baixar o profile.
AppViewRouter--error-compare = Não foi possível carregar os perfis.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari = Devido a uma <a>limitação específica no Safari</a>, o { -profiler-brand-name } não pode importar profiles da máquina local neste navegador. Abra esta página no { -firefox-brand-name } ou Chrome.
    .title = O Safari não consegue importar profiles locais
AppViewRouter--route-not-found--home =
    .specialMessage = A URL que você tentou acessar não foi reconhecida.

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (inlined)
    .title = { $function } foi inlined no chamador pelo compilador.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Mostrar <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Merge de função
    .title = Fazer merge de uma função a remove do profile e atribui seu tempo à função que a chamou. Isso acontece na árvore em qualquer lugar onde a função foi chamada.
CallNodeContextMenu--transform-merge-call-node = Merge de node apenas
    .title = Fazer merge de um node o remove do profile e atribui seu tempo ao node da função que o chamou. Só remove a função daquela parte específica da árvore. Qualquer outro lugar de onde a função foi chamada permanece no profile.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title = Focar em uma função remove amostras que não incluem aquela função. Além disso, muda a raiz da árvore de chamadas, de modo que a função seja a única raiz da árvore. Isso pode combinar vários locais de chamada de funções ao longo de um profile em um único node de chamadas.
CallNodeContextMenu--transform-focus-function = Foco na função
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Foco na função (invertido)
    .title = { CallNodeContextMenu--transform-focus-function-title }

##

CallNodeContextMenu--transform-focus-subtree = Foco em subárvore apenas
    .title = Focar em uma subárvore remove amostras que não incluem aquela parte específica da árvore de chamadas. É retirado um ramo da árvore de chamadas, mas o faz somente naquele único node de chamadas. Todas as outras chamadas da função são ignoradas.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Foco na categoria <strong>{ $categoryName }</strong>
    .title = Foco nos nodes que pertencem à mesma categoria do node selecionado, juntando assim todos os nodes de outras categorias.
CallNodeContextMenu--transform-collapse-function-subtree = Recolher função
    .title = Recolher uma função remove tudo o que ela chamou e atribui todo esse tempo para a função. Pode ajudar a simplificar um profile que faz chamada para código que não precisa ser analisado.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Recolher <strong>{ $nameForResource }</strong>
    .title = Recolher um recurso achata todas as chamadas àquele recurso em um único node de chamadas recolhido.
CallNodeContextMenu--transform-collapse-recursion = Recolher recursão
    .title =
        Recolher recursão remove chamadas que voltam repetidamente
        à mesma função, mesmo com funções intermediárias na pilha.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Só recolher recursão direta
    .title =
        Recolher recursão direta remove chamadas que voltam repetidamente
        à mesma função sem funções intermediárias na pilha.
CallNodeContextMenu--transform-drop-function = Descartar amostras com esta função
    .title = Descartar amostras remove o tempo delas do profile. Útil para eliminar informação de tempo que não é relevante para a análise.
CallNodeContextMenu--expand-all = Expandir tudo
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Procurar o nome da função no Searchfox
CallNodeContextMenu--copy-function-name = Copiar nome da função
CallNodeContextMenu--copy-script-url = Copiar URL do script
CallNodeContextMenu--copy-stack = Copiar pilha
CallNodeContextMenu--show-the-function-in-devtools = Mostrar a função no DevTools

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Tempo de execução (ms)
    .title = O tempo de execução “total” inclui um resumo de todo o tempo em que esta função foi observada estar na pilha. Inclui o tempo em que a função estava realmente sendo executada e o tempo gasto nas chamadas a partir desta função.
CallTree--tracing-ms-self = Próprio (ms)
    .title = O tempo “próprio” inclui somente o tempo em que a função estava no final da pilha. Se esta função chamou outras funções, então o tempo das “outras” funções não é incluído. O tempo “próprio” é útil para saber onde o tempo foi realmente gasto em um programa.
CallTree--samples-total = Total (amostras)
    .title = O contador “total” de amostras inclui um resumo de cada amostra em que esta função foi observada estar na pilha. Inclui o tempo em que a função estava realmente sendo executada e o tempo gasto nas chamadas a partir desta função.
CallTree--samples-self = Próprio
    .title = A contagem de amostras “próprio” inclui somente as amostras em que a função estava no final da pilha. Se esta função chamou outras funções, então a contagem de “outras” funções não é incluída. A contagem “próprio” é útil para saber onde o tempo foi realmente gasto em um programa.
CallTree--bytes-total = Tamanho total (bytes)
    .title = O “tamanho total” inclui um resumo de todos os bytes alocados ou desalocados enquanto esta função foi observada estar na pilha. Inclui tanto os bytes onde a função estava realmente sendo executada quanto os bytes das funções chamadas a partir desta função.
CallTree--bytes-self = Próprio (bytes)
    .title = Os bytes de “próprio” inclui os bytes alocados ou desalocados enquanto esta função estava no final da pilha. Se esta função chamou outras funções, então os bytes das “outras” funções não são incluídos. A informação de bytes de “próprio” é útil para saber onde a memória foi realmente alocada ou desalocada no programa.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Algumas chamadas a { $calledFunction } foram tornadas 'inline' pelo compilador.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (inlined)
    .title = Chamadas a { $calledFunction } foram tornadas 'inline' dentro de { $outerFunction } pelo compilador.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Selecione um node para exibir informações sobre ele.
CallTreeSidebar--call-node-details = Detalhes do node de chamadas

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
    .label = Tempo de execução registrado
CallTreeSidebar--traced-self-time =
    .label = Tempo próprio registrado
CallTreeSidebar--running-time =
    .label = Tempo de execução
CallTreeSidebar--self-time =
    .label = Tempo próprio
CallTreeSidebar--running-samples =
    .label = Amostras de execução
CallTreeSidebar--self-samples =
    .label = Amostras próprias
CallTreeSidebar--running-size =
    .label = Tamanho de execução
CallTreeSidebar--self-size =
    .label = Tamanho próprio
CallTreeSidebar--categories = Categorias
CallTreeSidebar--implementation = Implementação
CallTreeSidebar--running-milliseconds = Milissegundos de execução
CallTreeSidebar--running-sample-count = Contagem de amostras de execução
CallTreeSidebar--running-bytes = Bytes de execução
CallTreeSidebar--self-milliseconds = Milissegundos próprio
CallTreeSidebar--self-sample-count = Contagem de amostras próprio
CallTreeSidebar--self-bytes = Bytes próprio

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Insira as URLs de profile que você quer comparar
CompareHome--instruction-content = A ferramenta extrai os dados da faixa de cada profile no intervalo selecionado e coloca na mesma visão para facilitar a comparação.
CompareHome--form-label-profile1 = Profile 1:
CompareHome--form-label-profile2 = Profile 2:
CompareHome--submit-button =
    .value = Recuperar profiles

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message =
        Este profile foi gravado em uma compilação sem otimizações de versão.
        As observações de desempenho podem não se aplicar à população da versão.

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Abrir painel lateral
Details--close-sidebar-button =
    .title = Fechar painel lateral
Details--error-boundary-message =
    .message = Ops, ocorreu um erro desconhecido neste painel.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description = Relate este problema aos desenvolvedores, incluindo o erro completo exibido no console web das ferramentas de desenvolvimento.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Relatar o erro no GitHub

## Footer Links

FooterLinks--legal = Jurídico
FooterLinks--Privacy = Privacidade
FooterLinks--Cookies = Cookies
FooterLinks--languageSwitcher--select =
    .title = Mudar idioma
FooterLinks--hide-button =
    .title = Ocultar links de rodapé
    .aria-label = Ocultar links de rodapé

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> faixas

## Home page

Home--upload-from-file-input-button = Carregar um profile de arquivo
Home--upload-from-url-button = Carregar um profile de uma URL
Home--load-from-url-submit-button =
    .value = Carregar
Home--documentation-button = Documentação
Home--menu-button = Ativar botão de menu do { -profiler-brand-name }
Home--menu-button-instructions =
    Ative o botão de menu do profiler para iniciar a gravação de um profile de desempenho
    no { -firefox-brand-name }, depois analisar e compartilhar com profiler.firefox.com.
Home--profile-firefox-android-instructions =
    Você também pode criar profile pelo { -firefox-android-brand-name }.
    Para mais informações, consulte esta documentação:
    <a>Como criar profile do { -firefox-android-brand-name } diretamente no dispositivo</a>.
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Esta instância do profiler não conseguiu se conectar ao WebChannel, por isso não pode ativar o botão de menu do profiler.
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = Esta instância do profiler não conseguiu se conectar ao WebChannel. Isso geralmente significa que está sendo executado em um host diferente daquele especificado na preferência <code>devtools.performance.recording.ui-base-url</code>. Se você quiser capturar novos profiles com esta instância e dar a ela controle programático do botão de menu do profiler, pode ir em <code>about: config</code> e alterar a preferência.
Home--record-instructions = Para iniciar a gravação de um profile, clique no botão de gravação de profile ou use os atalhos de teclado. O ícone fica azul quando um profile está sendo gravado. Use <kbd>Capturar</kbd> para carregar os dados no profiler.firefox.com.
Home--instructions-content =
    A gravação de profiles de desempenho requer o <a>{ -firefox-brand-name }</a>.
    No entanto, profiles existentes podem ser vistos em qualquer navegador moderno.
Home--record-instructions-start-stop = Interrompa e inicie a gravação de profiles
Home--record-instructions-capture-load = Capture e carregue um profile
Home--profiler-motto = Capture um profile de desempenho. Analise. Compartilhe. Torne a web mais rápida.
Home--additional-content-title = Carregar profiles existentes
Home--additional-content-content = Você pode <strong>arrastar e soltar</strong> aqui um arquivo de profile para carregar, ou:
Home--compare-recordings-info = Você também pode comparar gravações. <a>Abra a interface de comparação.</a>
Home--your-recent-uploaded-recordings-title = Suas gravações enviadas recentemente
Home--dark-mode-title = Modo escuro
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 = O { -profiler-brand-name } também pode importar profiles de outros criadores de profile, como o <perf>Linux perf</perf>, o <simpleperf>Android SimplePerf</simpleperf>, o painel de desempenho do Chrome, o <androidstudio>Android Studio</androidstudio>, ou qualquer arquivo nos formatos <dhat>dhat</dhat> ou <traceevent>Trace Event do Google</traceevent>. <write>Saiba como criar seu próprio importador</write>.
Home--install-chrome-extension = Instale a extensão para Chrome
Home--chrome-extension-instructions = Use a <a>extensão { -profiler-brand-name } para Chrome</a> para capturar profiles de desempenho no Chrome e analisar no { -profiler-brand-name }. Instale a extensão a partir do Chrome Web Store.
Home--chrome-extension-recording-instructions = Após instalar, use o ícone da extensão na barra de ferramentas ou os atalhos para iniciar e encerrar a gravação de profiles. Você também pode exportar profiles e carregar aqui para análises detalhadas.

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Insira termos de filtragem

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = Mostrar apenas o próprio tempo
    .title = Mostrar somente o tempo gasto em um node de chamadas, ignorando seus filhos.

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = Clique aqui para carregar o profile { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Excluir
    .title = Este profile não pode ser excluído por falta de informações de autorização.
ListOfPublishedProfiles--uploaded-profile-information-list-empty = Nenhum profile foi carregado ainda!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Veja e gerencie todas as suas gravações (mais { $profilesRestCount })
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

MarkerContextMenu--set-selection-from-duration = Definir seleção a partir da duração do marcador
MarkerContextMenu--start-selection-here = Iniciar a seleção aqui
MarkerContextMenu--end-selection-here = Finalizar a seleção aqui
MarkerContextMenu--start-selection-at-marker-start = Iniciar a seleção no <strong>início</strong> do marcador
MarkerContextMenu--start-selection-at-marker-end = Iniciar a seleção no <strong>final</strong> do marcador
MarkerContextMenu--end-selection-at-marker-start = Terminar a seleção no <strong>início</strong> do marcador
MarkerContextMenu--end-selection-at-marker-end = Terminar a seleção no <strong>final</strong> do marcador
MarkerContextMenu--copy-description = Copiar descrição
MarkerContextMenu--copy-call-stack = Copiar pilha de chamadas
MarkerContextMenu--copy-url = Copiar URL
MarkerContextMenu--copy-page-url = Copiar URL da página
MarkerContextMenu--copy-as-json = Copiar como JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Selecionar o thread receptor “<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Selecionar o thread remetente “<strong>{ $threadName }</strong>”

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = Descartar amostras fora dos marcadores correspondentes a “<strong>{ $filter }</strong>”

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = Copiar tabela de marcadores como texto simples
MarkerCopyTableContextMenu--copy-table-as-markdown = Copiar tabela de marcadores como Markdown

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = Filtrar marcadores:
    .title = Só exibir marcadores que correspondem a um determinado nome
MarkerSettings--marker-filters =
    .title = Filtros de marcação
MarkerSettings--copy-table =
    .title = Copiar tabela como texto
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = O número de linhas excede o limite: { $rows } > { $maxRows }. Somente as primeiras { $maxRows } linhas serão copiadas.

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = Selecione um marcador para exibir informações sobre ele.

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = Início
MarkerTable--duration = Duração
MarkerTable--name = Nome
MarkerTable--details = Detalhes

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = Mostrar apenas marcadores correspondentes a: “{ $filter }”
    .aria-label = Mostrar apenas marcadores correspondentes a: “{ $filter }”

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
MenuButtons--index--docs = Documentação
MenuButtons--permalink--button =
    .label = Link permanente

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Enviado:
MenuButtons--index--profile-info-uploaded-actions = Excluir
MenuButtons--index--metaInfo-subtitle = Informações do profile
MenuButtons--metaInfo--symbols = Símbolos:
MenuButtons--metaInfo--profile-symbolicated = O profile está com simbólicos
MenuButtons--metaInfo--profile-not-symbolicated = O profile não está com simbólicos
MenuButtons--metaInfo--resymbolicate-profile = Recriar simbólicos no profile
MenuButtons--metaInfo--symbolicate-profile = Criar simbólicos no profile
MenuButtons--metaInfo--attempting-resymbolicate = Tentando recriar simbólicos no profile
MenuButtons--metaInfo--currently-symbolicating = Criando simbólicos no profile
MenuButtons--metaInfo--cpu-model = Modelo de CPU:
MenuButtons--metaInfo--cpu-cores = Núcleos de CPU:
MenuButtons--metaInfo--main-memory = Memória principal:
MenuButtons--index--show-moreInfo-button = Mostrar mais
MenuButtons--index--hide-moreInfo-button = Mostrar menos
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } core físico, { $logicalCPUs } core lógico
               *[other] { $physicalCPUs } core físico, { $logicalCPUs } cores lógicos
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } cores físicos, { $logicalCPUs } core lógico
               *[other] { $physicalCPUs } cores físicos, { $logicalCPUs } cores lógicos
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } core físico
       *[other] { $physicalCPUs } cores físicos
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } core lógico
       *[other] { $logicalCPUs } cores lógicos
    }
MenuButtons--metaInfo--profiling-started = Gravação iniciada:
MenuButtons--metaInfo--profiling-session = Duração da gravação:
MenuButtons--metaInfo--main-process-started = Processo principal iniciado:
MenuButtons--metaInfo--main-process-ended = Processo principal finalizado:
MenuButtons--metaInfo--file-name = Nome do arquivo:
MenuButtons--metaInfo--file-size = Tamanho do arquivo:
MenuButtons--metaInfo--interval = Intervalo:
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
MenuButtons--metaInfo--application = Aplicativo
MenuButtons--metaInfo--name-and-version = Nome e versão:
MenuButtons--metaInfo--application-uptime = Tempo de atividade:
MenuButtons--metaInfo--update-channel = Canal de atualização:
MenuButtons--metaInfo--build-id = ID da compilação:
MenuButtons--metaInfo--build-type = Tipo de compilação:
MenuButtons--metaInfo--arguments = Argumentos:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Debug
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = Plataforma
MenuButtons--metaInfo--device = Dispositivo:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = Sistema operacional:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Métricas visuais
MenuButtons--metaInfo--speed-index = Índice de velocidade:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Índice de velocidade perceptivo:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Índice de velocidade de todo o conteúdo:
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
MenuButtons--metaOverheadStatistics-profiled-duration = Duração da gravação de profile:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Incluir threads ocultos
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Incluir os dados de outras abas
MenuButtons--publish--renderCheckbox-label-hidden-time = Incluir intervalo de tempo oculto
MenuButtons--publish--renderCheckbox-label-include-screenshots = Incluir capturas de tela
MenuButtons--publish--renderCheckbox-label-resource = Incluir URLs e caminhos de recursos
MenuButtons--publish--renderCheckbox-label-extension = Incluir informações da extensão
MenuButtons--publish--renderCheckbox-label-preference = Incluir valores de preferências
MenuButtons--publish--renderCheckbox-label-private-browsing = Incluir os dados de janelas de navegação privativa
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Este profile contém dados de navegação privativa
MenuButtons--publish--reupload-performance-profile = Reenviar profile de desempenho
MenuButtons--publish--share-performance-profile = Compartilhar profile de desempenho
MenuButtons--publish--info-description = Enviar seu profile e tornar acessível a qualquer pessoa que tenha o link.
MenuButtons--publish--info-description-default = Por padrão, seus dados pessoais são removidos.
MenuButtons--publish--info-description-firefox-nightly2 = Este profile é do { -firefox-nightly-brand-name }, então, por padrão, a maioria das informações é incluída.
MenuButtons--publish--include-additional-data = Incluir dados adicionais que podem ser identificáveis
MenuButtons--publish--button-upload = Enviar
MenuButtons--publish--upload-title = Enviando profile…
MenuButtons--publish--cancel-upload = Cancelar envio
MenuButtons--publish--message-something-went-wrong = Ops, algo deu errado ao enviar o profile.
MenuButtons--publish--message-try-again = Tentar novamente
MenuButtons--publish--download = Baixar
MenuButtons--publish--compressing = Compactando…
MenuButtons--publish--error-while-compressing = Erro ao compactar, experimente desmarcar algumas opções para reduzir o tamanho do profile.

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = Filtrar redes:
    .title = Só exibir requisições de rede que correspondem a um determinado nome

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

PanelSearch--search-field-hint = Você sabia que pode usar vírgula (,) para pesquisar usando vários termos?

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = Mudar o nome do profile
ProfileName--edit-profile-name-input =
    .title = Mudar o nome do profile
    .aria-label = Nome do profile

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Excluir
    .title = Clique aqui para excluir o profile { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Ocorreu um erro ao excluir este perfil. <a>Passe o mouse para saber mais.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = Excluir { $profileName }
ProfileDeletePanel--dialog-confirmation-question =
    Tem certeza que quer excluir os dados enviados deste perfil? Links
    compartilhados anteriormente não funcionarão mais.
ProfileDeletePanel--dialog-cancel-button =
    .value = Cancelar
ProfileDeletePanel--dialog-delete-button =
    .value = Excluir
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Excluindo…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Os dados enviados foram excluídos com êxito.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Intervalo completo ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = Importando e processando o profile…
ProfileLoaderAnimation--loading-unpublished = Importando o profile diretamente do { -firefox-brand-name }…
ProfileLoaderAnimation--loading-from-file = Lendo o arquivo e processando o profile…
ProfileLoaderAnimation--loading-local = Ainda não implementado.
ProfileLoaderAnimation--loading-public = Baixando e processando o profile…
ProfileLoaderAnimation--loading-from-url = Baixando e processando o profile…
ProfileLoaderAnimation--loading-compare = Lendo e processando profiles…
ProfileLoaderAnimation--loading-view-not-found = Vista não encontrada

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Voltar ao início

## Root

Root--error-boundary-message =
    .message = Ops, aconteceu algum erro desconhecido em profiler.firefox.com.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Aplicando…
ServiceWorkerManager--pending-button = Aplicar e recarregar
ServiceWorkerManager--installed-button = Recarregar o aplicativo
ServiceWorkerManager--updated-while-not-ready =
    Uma nova versão do aplicativo foi aplicada antes desta página
    ter sido totalmente carregada. Pode não funcionar direito.
ServiceWorkerManager--new-version-is-ready = Uma nova versão do aplicativo foi baixada e está pronta para uso.
ServiceWorkerManager--hide-notice-button =
    .title = Ocultar o aviso de recarga
    .aria-label = Ocultar o aviso de recarga

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-frames = Todos os frames
    .title = Não filtrar frames de pilha
StackSettings--implementation-script = Script
    .title = Mostrar somente os frames de pilhas relacionados a execução de scripts
StackSettings--implementation-native2 = Nativo
    .title = Mostrar apenas os frames de pilha de código nativo
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = Filtrar pilhas:
StackSettings--use-data-source-label = Origem de dados:
StackSettings--call-tree-strategy-timing = Tempos
    .title = Resumir usando pilhas de amostras de código executado ao longo do tempo
StackSettings--call-tree-strategy-js-allocations = Alocações JavaScript
    .title = Resumir usando bytes alocados de JavaScript (sem desalocações)
StackSettings--call-tree-strategy-native-retained-allocations = Memória retida
    .title = Resumir usando bytes de memória que foram alocados, mas nunca liberados na atual seleção de visão
StackSettings--call-tree-native-allocations = Memória alocada
    .title = Resumir usando bytes de memória alocada
StackSettings--call-tree-strategy-native-deallocations-memory = Memória desalocada
    .title = Resumir usando bytes de memória desalocada, com base no local onde a memória foi alocada
StackSettings--call-tree-strategy-native-deallocations-sites = Locais de desalocação
    .title = Resumir usando bytes de memória desalocada, com base no local onde a memória foi desalocada
StackSettings--invert-call-stack = Inverter pilha de chamadas
    .title = Ordenar pelo tempo gasto em um node de chamadas, ignorando seus filhos.
StackSettings--show-user-timing = Mostrar tempo do usuário
StackSettings--use-stack-chart-same-widths = Usar a mesma largura em cada pilha
StackSettings--panel-search =
    .label = Filtrar pilhas:
    .title = Só exibir pilhas que contêm uma função cujo nome corresponde a esta substring

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Árvore de chamadas
TabBar--flame-graph-tab = Gráfico de chama
TabBar--stack-chart-tab = Gráfico de pilha
TabBar--marker-chart-tab = Gráfico de marcadores
TabBar--marker-table-tab = Tabela de marcadores
TabBar--network-tab = Rede
TabBar--js-tracer-tab = Traçador JS

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = Todas as abas e janelas

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Mostrar apenas este processo
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Mostrar apenas “{ $trackName }”
TrackContextMenu--hide-other-screenshots-tracks = Ocultar outras faixas de capturas de tela
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = Ocultar “{ $trackName }”
TrackContextMenu--show-all-tracks = Mostrar todas as faixas
TrackContextMenu--show-local-tracks-in-process = Mostrar todas as faixas deste processo
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = Ocultar todas as faixas do tipo “{ $type }”
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Mostrar todas as faixas correspondentes
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Ocultar todas as faixas correspondentes
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = Nenhum resultado encontrado de “<span>{ $searchFilter }</span>”
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Ocultar faixa
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = Ocultar processo

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = memória relativa neste momento
TrackMemoryGraph--memory-range-in-graph = intervalo de memória no gráfico
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = alocações e desalocações desde a amostra anterior

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
    .label = Energia
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Energia
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Energia
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Energia média na seleção atual
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Energia média na seleção atual
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Energia média na seleção atual
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energia usada no intervalo visível
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energia usada no intervalo visível
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energia usada no intervalo visível
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energia usada no intervalo visível
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh ({ $carbonValue } kg CO₂e)
    .label = Energia usada na seleção atual
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO₂e)
    .label = Energia usada na seleção atual
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO₂e)
    .label = Energia usada na seleção atual
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO₂e)
    .label = Energia usada na seleção atual

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
TrackBandwidthGraph--speed = { $value } por segundo
    .label = Velocidade de transferência desta amostra
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = operações de leitura/escrita desde a amostra anterior
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Dados transferidos até agora
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value } ({ $carbonValue } g CO₂e)
    .label = Dados transferidos no intervalo visível
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value } ({ $carbonValue } g CO₂e)
    .label = Dados transferidos na seleção atual

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = Digitar termos de filtragem
    .title = Só exibir faixas que correspondem a determinado texto

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
TransformNavigator--collapse-resource = Recolher: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = Focar node: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = Focar: { $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = Foco na categoria: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = Merge node: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = Merge: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = Descartar: { $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = Recolher recursão: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = Recolher só recursão direta: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = Recolher subárvore: { $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = Descartar amostras fora dos marcadores correspondentes: “{ $item }”

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = Aguardando { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = Aguardando { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Código-fonte não disponível
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = Consulte <a>issue #3741</a> para ver cenários suportados e melhorias planejadas.
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Código assembly não disponível
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = Consulte <a>issue #4520</a> para ver cenários suportados e melhorias planejadas.
SourceView--close-button =
    .title = Fechar visão de código-fonte

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = Não há nenhuma URL de origem cruzada conhecida para este arquivo.
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = Ocorreu um erro de rede ao buscar a URL { $url }: { $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = Não foi possível consultar a API de simbolização do navegador: { $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = A API de simbolização do navegador retornou um erro: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = A API de simbolização do servidor local de símbolos retornou um erro: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = A API de simbolização do navegador retornou uma resposta com erro no formato: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = A API de simbolização do servidor local de símbolos retornou uma resposta com erro no formato: { $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = O arquivo { $pathInArchive } não foi encontrado no pacote de { $url }.
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = O pacote em { $url } não pôde ser analisado: { $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = O navegador não conseguiu obter o arquivo fonte de { $url } com sourceUuid { $sourceUuid }: { $errorMessage }.

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Mostrar a exibição em assembly
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Ocultar a exibição em assembly
# The "◀" button above the assembly view.
AssemblyView--prev-button =
    .title = Anterior
# The "▶" button above the assembly view.
AssemblyView--next-button =
    .title = Próximo
# The label showing the current position and total count above the assembly view.
# Variables:
#   $current (Number) - The current position (1-indexed).
#   $total (Number) - The total count.
AssemblyView--position-label = { $current } de { $total }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Gravações enviadas
