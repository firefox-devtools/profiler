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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>{ -firefox-brand-name } 效能分析網頁應用程式</subheader>
AppHeader--github-icon =
    .title = 前往我們的 Git 儲存庫（開啟新視窗）

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = 無法從 { -firefox-brand-name } 取得效能檢測檔。
AppViewRouter--error-message-from-file =
    .message = 無法讀取檔案或剖析檔案當中的效能檢測資訊。
AppViewRouter--error-message-local =
    .message = 尚未實作。
AppViewRouter--error-message-public =
    .message = 無法下載效能檢測檔。
AppViewRouter--error-message-from-url =
    .message = 無法下載效能檢測檔。
AppViewRouter--route-not-found--home =
    .specialMessage = 無法處理您嘗試開啟的網址。

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = 合併函數
    .title = 合併函數後會將其從效能檢測檔移除，並將時間歸入呼叫該函數的函數。此函數在效能樹中所有發生之處都會被合併。
CallNodeContextMenu--transform-merge-call-node = 只合併節點
    .title = 合併節點後會將其從效能檢測檔移除，並將時間歸入呼叫該節點的函數節點。只會移除效能樹當中特定部分的函數，其他對該函數呼叫的部分將保留在檢測檔中。
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title = 聚焦於函數，將移除該函數之外所有紀錄到的項目。除此之外，還會重新將呼叫樹的根指定為該函數。此功能可以將檢測檔中的多個函數呼叫點合併為單一呼叫節點。
CallNodeContextMenu--transform-focus-function = 聚焦於函數
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = 聚焦於函數（反向）
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = 只聚焦於子樹
    .title = 聚焦於子樹，將從呼叫樹中拉出分支，並移除不屬於該分支的內容。然而此功能只對單一呼叫節點有效，將忽略其他呼叫該函數的部分。
CallNodeContextMenu--transform-collapse-function-subtree = 摺疊函數
    .title = 將函數摺疊後，將移除所有呼叫內容，並將所有執行時間併入該函數中。這樣做可簡化檢測檔內容，將不需要分析的程式合併為單一呼叫。
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = 摺疊<strong>{ $nameForResource }</strong>
    .title = 摺疊資源可將所有對該資源的呼叫，壓平成已摺疊的單一呼叫節點。
CallNodeContextMenu--transform-collapse-direct-recursion = 摺疊直接遞迴
    .title = 摺疊直接遞迴可移除對相同函數的重複遞迴呼叫。
CallNodeContextMenu--transform-drop-function = 丟棄與此函數的相關檢測樣本
    .title = 丟棄樣本後將會從檢測檔移除該樣本所執行的時間。需要清除與分析無關的計時資訊時，此功能相當有用。
CallNodeContextMenu--expand-all = 全部展開
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = 用 Searchfox 搜尋函數名稱
CallNodeContextMenu--copy-function-name = 複製函數名稱
CallNodeContextMenu--copy-script-url = 複製指令碼網址
CallNodeContextMenu--copy-stack = 複製堆疊

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = 執行時間（ms）
    .title = 「總執行時間」包含此函數被觀測到位於堆疊上的總時間長度摘要。包含函數實際執行、以及此函數的呼叫者所花費的時間。
CallTree--tracing-ms-self = Self（ms）
    .title = 「Self」時間只包含函數在堆疊底部結束時的時間。若此函數是透過其他函數呼叫的，則不會包含「該函數」的時間。「self」時間適合用來了解程式當中實際花費了多少時間在哪些函數上。
CallTree--samples-total = 總計（樣本數）
    .title = 此函數在堆疊上被觀察到出現的「總計」次數。包含函數實際執行的次數，以及此函數中所呼叫的次數。

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = 選擇節點來顯示該節點的相關資訊。

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = 輸入您想要用來比較的檢測檔網址
CompareHome--instruction-content = 此工具將從每個效能檢測檔當中抽出選擇的軌道與範圍相關資料，並將它們放到相同的畫面上，方便比較。
CompareHome--form-label-profile1 = 檢測檔 1:
CompareHome--form-label-profile2 = 檢測檔 2:
CompareHome--submit-button =
    .value = 取得檢測檔

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message = 此檢測檔是使用未經發行最佳化的編譯版本紀錄的。所作效能觀察可能不適用於使用一般發行版的使用者。

## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = 開啟側邊欄
Details--close-sidebar-button =
    .title = 關閉側邊欄
Details--error-boundary-message =
    .message = 哇喔，此面板發生某些未知錯誤。

## Footer Links

FooterLinks--legal = 法律資訊
FooterLinks--Privacy = 隱私權
FooterLinks--Cookies = Cookie

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = 圖表類型:
FullTimeline--categories-with-cpu = 含 CPU 的分類
FullTimeline--categories = 分類
FullTimeline--stack-height = 堆疊高度
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible = 可見 <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> 軌

## Home page

Home--upload-from-file-input-button = 從檔案載入檢測檔
Home--upload-from-url-button = 從網址載入檢測檔
Home--load-from-url-submit-button =
    .value = 載入
Home--documentation-button = 文件
Home--menu-button = 開啟 { -profiler-brand-name } 選單按鈕
Home--menu-button-instructions = 開啟 { -firefox-brand-name } 當中的檢測器選單按鈕開始紀錄效能，然後進行分析並分享到 profiler.firefox.com。
Home--addon-button = 安裝附加元件
Home--addon-button-instructions = 安裝 Gecko Profiler 附加元件，即可在 { -firefox-brand-name } 當中紀錄效能，然後進行分析並分享到 profiler.firefox.com。
Home--record-instructions = 請點擊檢測按鈕或按下鍵盤快速鍵即可開始進行檢測。進行效能紀錄時，此圖示將會顯示成藍色。按下<kbd>捕捉</kbd>即可將資料載入到 profiler.firefox.com。
Home--instructions-title = 如何檢視並記錄檢測檔
Home--instructions-content = 需要使用 <a>{ -firefox-brand-name }</a> 紀錄效能檢測檔。但可以使用任何現代瀏覽器檢視現有的檢測檔。
Home--record-instructions-start-stop = 停止並開始檢測
Home--record-instructions-capture-load = 捕捉並載入檢測檔
Home--profiler-motto = 捕捉效能檢測檔。分析、分享、讓網站運作更快。
Home--additional-content-title = 載入現有檢測檔
Home--additional-content-content = 您可以將效能檢測檔<strong>拖曳</strong>到此處，或:
Home--compare-recordings-info = 您也可以比較紀錄內容。<a>開啟比較介面。</a>
Home--recent-uploaded-recordings-title = 近期上傳的紀錄

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = 輸入過濾條件

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = 只顯示 self 時間
    .title = 只顯示呼叫節點所花的時間，而忽略其 children。

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = 點擊此處載入檢測檔 { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = 刪除
    .title = 由於缺少授權資訊，無法刪除此效能檢測檔。
ListOfPublishedProfiles--uploaded-profile-information-list-empty = 還沒有上傳任何檢測檔！
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = 檢視並管理您的所有紀錄檔（還有 { $profilesRestCount } 筆）
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] 管理此紀錄
       *[other] 管理下列紀錄
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = 根據標記的持續時間選擇
MarkerContextMenu--start-selection-here = 從此處開始選擇
MarkerContextMenu--end-selection-here = 至此結束選擇
MarkerContextMenu--start-selection-at-marker-start = 從標記的<strong>起點</strong>開始選擇
MarkerContextMenu--start-selection-at-marker-end = 從標記的<strong>終點</strong>開始選擇
MarkerContextMenu--end-selection-at-marker-start = 選擇到標記的<strong>起點</strong>為止
MarkerContextMenu--end-selection-at-marker-end = 選擇到標記的<strong>終點</strong>為止
MarkerContextMenu--copy-description = 複製描述
MarkerContextMenu--copy-call-stack = 複製呼叫堆疊
MarkerContextMenu--copy-url = 複製網址
MarkerContextMenu--copy-full-payload = 複製完整酬載

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = 過濾標記:
    .title = 只顯示符合特定名稱的標記

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = 選擇標記來顯示該標記的相關資訊。

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = 開始
MarkerTable--duration = 持續時間
MarkerTable--type = 類型
MarkerTable--description = 描述

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = 檢測檔資訊
MenuButtons--index--full-view = 完整畫面
MenuButtons--index--cancel-upload = 取消上傳
MenuButtons--index--share-upload =
    .label = 上傳本機檢測檔
MenuButtons--index--share-re-upload =
    .label = 重新上傳
MenuButtons--index--share-error-uploading =
    .label = 上傳時發生錯誤
MenuButtons--index--revert = 回復到原始檢測檔
MenuButtons--index--docs = 文件
MenuButtons--permalink--button =
    .label = 永久鏈結

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = 上傳於:
MenuButtons--index--profile-info-uploaded-actions = 刪除
MenuButtons--index--metaInfo-subtitle = 檢測檔資訊
MenuButtons--metaInfo--symbols = 符號:
MenuButtons--metaInfo--profile-symbolicated = 檢測檔已符號化
MenuButtons--metaInfo--profile-not-symbolicated = 檢測檔未符號化
MenuButtons--metaInfo--resymbolicate-profile = 重新將檢測檔符號化
MenuButtons--metaInfo--symbolicate-profile = 符號化檢測檔
MenuButtons--metaInfo--attempting-resymbolicate = 正在嘗試重新符號化檢測檔
MenuButtons--metaInfo--currently-symbolicating = 目前符號化的檢測檔
MenuButtons--metaInfo--cpu = CPU:
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
       *[other] { $physicalCPUs } 顆實體核心
    }、{ $logicalCPUs ->
       *[other] { $logicalCPUs } 顆邏輯核心
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
       *[other] { $physicalCPUs } 顆實體核心
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
       *[other] { $logicalCPUs } 顆邏輯核心
    }
MenuButtons--metaInfo--recording-started = 紀錄開始於:
MenuButtons--metaInfo--interval = 間隔:
MenuButtons--metaInfo--profile-version = 檢測檔版本:
MenuButtons--metaInfo--buffer-capacity = 緩衝容量:
MenuButtons--metaInfo--buffer-duration = 緩衝間隔:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
       *[other] { $configurationDuration } 秒
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = 無限制
MenuButtons--metaInfo--application = 應用程式
MenuButtons--metaInfo--name-and-version = 名稱與版本:
MenuButtons--metaInfo--update-channel = 更新頻道:
MenuButtons--metaInfo--build-id = Build ID:
MenuButtons--metaInfo--build-type = Build Type:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = 除錯
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = 平台
MenuButtons--metaInfo--device = 裝置:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = OS:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = 視覺指標
MenuButtons--metaInfo--speed-index = Speed Index:
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Perceptual Speed Index:
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Contentful Speed Index:
MenuButtons--metaInfo-renderRowOfList-label-features = 功能:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = 執行緒過濾器:
MenuButtons--metaInfo-renderRowOfList-label-extensions = 擴充套件:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = { -profiler-brand-short-name } 額外負荷
MenuButtons--metaOverheadStatistics-mean = 平均
MenuButtons--metaOverheadStatistics-max = 最大值
MenuButtons--metaOverheadStatistics-min = 最小值
MenuButtons--metaOverheadStatistics-statkeys-overhead = 額外負荷
    .title = 用來計量所有執行緒的時間。
MenuButtons--metaOverheadStatistics-statkeys-cleaning = 清理
    .title = 用來清理過期資料的時間。
MenuButtons--metaOverheadStatistics-statkeys-counter = 計數
    .title = 用來取得所有計數器的時間。
MenuButtons--metaOverheadStatistics-statkeys-interval = 間隔
    .title = 兩次計量間的間隔。
MenuButtons--metaOverheadStatistics-statkeys-lockings = 鎖定
    .title = 進行計量前取得鎖定所需的時間。
MenuButtons--metaOverheadStatistics-overhead-duration = 額外負荷持續時間:
MenuButtons--metaOverheadStatistics-overhead-percentage = 額外負荷比例:
MenuButtons--metaOverheadStatistics-profiled-duration = 檢測的持續時間:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = 包含隱藏的執行緒
MenuButtons--publish--renderCheckbox-label-hidden-time = 包含隱藏的時間範圍
MenuButtons--publish--renderCheckbox-label-include-screenshots = 包含畫面擷圖
MenuButtons--publish--renderCheckbox-label-resource = 包含資源網址與路徑
MenuButtons--publish--renderCheckbox-label-extension = 包含擴充套件資訊
MenuButtons--publish--renderCheckbox-label-preference = 包含偏好設定值
MenuButtons--publish--reupload-performance-profile = 重新上傳效能檢測檔
MenuButtons--publish--share-performance-profile = 分享效能檢測檔
MenuButtons--publish--info-description = 上傳您的檢測檔並透過鏈結分享，讓任何取得該鏈結的人都能存取。
MenuButtons--publish--info-description-default = 預設情況下，將會移除您的個人資料。
MenuButtons--publish--info-description-firefox-nightly = 此檢測檔來自 { -firefox-nightly-brand-name }，預設情況下將包含所有資訊。
MenuButtons--publish--include-additional-data = 包含其他資料後，可能造成檢測檔可被識別。
MenuButtons--publish--button-upload = 上傳
MenuButtons--publish--upload-title = 正在上傳檢測檔…
MenuButtons--publish--cancel-upload = 取消上傳
MenuButtons--publish--message-something-went-wrong = 哇喔，上傳檢測檔時發生某些錯誤。
MenuButtons--publish--message-try-again = 再試一次
MenuButtons--publish--download = 下載
MenuButtons--publish--compressing = 壓縮中…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = 過濾網路請求:
    .title = 只顯示符合某些名稱的網路請求

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = 您知道可以使用半形逗號（,）搜尋多個詞彙嗎？

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = 刪除
    .title = 點擊此處刪除檢測檔 { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = 完整範圍

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = 正在直接從 { -firefox-brand-name } 匯入檢測檔…
ProfileLoaderAnimation--loading-message-from-file =
    .message = 正在讀取檔案並處理檢測檔…
ProfileLoaderAnimation--loading-message-local =
    .message = 尚未實作。
ProfileLoaderAnimation--loading-message-public =
    .message = 正在下載處理檢測檔…
ProfileLoaderAnimation--loading-message-from-url =
    .message = 正在下載處理檢測檔…
ProfileLoaderAnimation--loading-message-compare =
    .message = 正在讀取與處理檢測檔…
ProfileLoaderAnimation--loading-message-view-not-found =
    .message = 找不到畫面

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = 回到首頁

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = 安裝中…
ServiceWorkerManager--pending-button = 套用並重新載入
ServiceWorkerManager--installed-button = 重新載入應用程式
ServiceWorkerManager--updated-while-not-ready =
    在此頁面完整載入前，已有新版應用程式生效。
    
    您可能會遇到某些不正常的部分。
ServiceWorkerManager--new-version-is-ready = 已下載新版本的應用程式，準備好可以使用。
ServiceWorkerManager--hide-notice-button =
    .title = 隱藏重新載入通知
    .aria-label = 隱藏重新載入通知

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = 所有堆疊
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = 原生
StackSettings--use-data-source-label = 資料來源:
StackSettings--call-tree-strategy-timing = 計時
    .title = 使用紀錄到已執行的程式碼顯示摘要
StackSettings--call-tree-strategy-js-allocations = JavaScript 分配
    .title = 顯示 JavaScript 分配到的位元組摘要（不含解除分配）
StackSettings--call-tree-strategy-native-retained-allocations = 保留的記憶體
    .title = 根據分配到且於目前選擇的預覽範圍中，從未釋放的記憶體位元組數進行摘要
StackSettings--call-tree-native-allocations = 分配到的記憶體
    .title = 根據分配到的記憶體位元組數量進行摘要
StackSettings--call-tree-strategy-native-deallocations-memory = 取消分配的記憶體
    .title = 依照分配到記憶體的位置，根據取消分配的記憶體位元組數進行摘要
StackSettings--call-tree-strategy-native-deallocations-sites = 取消分配的位置
    .title = 依照取消分配記憶體的位置，根據取消分配的記憶體位元組數進行摘要
StackSettings--invert-call-stack = 反轉呼叫堆疊
    .title = 依照呼叫節點當中花費的時間排序，並忽略其 children。
StackSettings--show-user-timing = 顯示使用者計時
StackSettings--panel-search =
    .label = 過濾堆疊:
    .title = 只顯示包含符合的子字串的函數名稱的相關堆疊

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = 呼叫數
TabBar--flame-graph-tab = 火焰圖
TabBar--stack-chart-tab = 堆疊圖
TabBar--marker-chart-tab = 標記圖
TabBar--marker-table-tab = 標記表
TabBar--network-tab = 網路
TabBar--js-tracer-tab = JS 追蹤器

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = 只顯示此處理程序群組
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = 只顯示「{ $trackName }」
TrackContextMenu--hide-other-screenshots-tracks = 隱藏其他畫面擷圖軌
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = 隱藏「{ $trackName }」
TrackContextMenu--show-all-tracks = 顯示所有軌道

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
TransformNavigator--complete = 完成「{ $item }」
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = 折疊: { $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = 聚焦節點: { $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = 聚焦: { $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = 合併節點: { $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = 合併: { $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = 丟棄: { $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion = 摺疊遞迴: { $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = 摺疊子樹: { $item }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = 已上傳的紀錄檔
