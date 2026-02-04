# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox for Android
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

AppViewRouter--error-from-post-message = 無法匯入效能檢測檔。
AppViewRouter--error-unpublished = 無法從 { -firefox-brand-name } 取得效能檢測檔。
AppViewRouter--error-from-file = 無法讀取檔案或剖析檔案當中的效能檢測資訊。
AppViewRouter--error-local = 尚未實作。
AppViewRouter--error-public = 無法下載效能檢測檔。
AppViewRouter--error-from-url = 無法下載效能檢測檔。
AppViewRouter--error-compare = 無法取得效能檢測檔。
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari = 由於 <a>Safari 的特殊限制</a>，{ -profiler-brand-name } 無法從這套瀏覽器自本機匯入效能檢測檔。請改用 { -firefox-brand-name } 或 Chrome 開啟此頁面。
    .title = 無法使用 Safari 匯入本機效能檢測檔
AppViewRouter--route-not-found--home =
    .specialMessage = 無法處理您嘗試開啟的網址。

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = （內聯）
    .title = 編譯器將 { $function } 內聯到呼叫它的函式中。

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = 顯示 <strong>{ $fileName }</strong>
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

## The translation for "self" in these strings should match the translation used
## in CallTree--samples-self and CallTree--bytes-self. Alternatively it can be
## translated as "self values" or "self time" (though "self time" is less desirable
## because this menu item is also shown in "bytes" mode).

CallNodeContextMenu--transform-focus-self-title = 聚焦於 self 與聚焦於函數類似，但只保留與函數的 self 時間有關的取樣。將捨棄被呼叫者的取樣，並將呼叫樹重新放置於聚焦的函數根上。
CallNodeContextMenu--transform-focus-self = 只聚焦於 self
    .title = { CallNodeContextMenu--transform-focus-self-title }

##

CallNodeContextMenu--transform-focus-subtree = 只聚焦於子樹
    .title = 聚焦於子樹，將從呼叫樹中拉出分支，並移除不屬於該分支的內容。然而此功能只對單一呼叫節點有效，將忽略其他呼叫該函數的部分。
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = 聚焦於分類 <strong>{ $categoryName }</strong>
    .title = 聚焦於與選擇的節點相同的分類，因此會將屬於其他分類的節點合併起來。
CallNodeContextMenu--transform-collapse-function-subtree = 摺疊函數
    .title = 將函數摺疊後，將移除所有呼叫內容，並將所有執行時間併入該函數中。這樣做可簡化檢測檔內容，將不需要分析的程式合併為單一呼叫。
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = 摺疊<strong>{ $nameForResource }</strong>
    .title = 摺疊資源可將所有對該資源的呼叫，壓平成已摺疊的單一呼叫節點。
CallNodeContextMenu--transform-collapse-recursion = 摺疊遞迴
    .title = 移除重複遞迴相同函數，但堆疊中含有中介函數的遞迴。
CallNodeContextMenu--transform-collapse-direct-recursion-only = 僅摺疊直接遞迴
    .title = 移除重複遞迴相同函數，但堆疊中不含中介函數的直接遞迴。
CallNodeContextMenu--transform-drop-function = 丟棄與此函數的相關檢測樣本
    .title = 丟棄樣本後將會從檢測檔移除該樣本所執行的時間。需要清除與分析無關的計時資訊時，此功能相當有用。
CallNodeContextMenu--expand-all = 全部展開
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = 用 Searchfox 搜尋函數名稱
CallNodeContextMenu--copy-function-name = 複製函數名稱
CallNodeContextMenu--copy-script-url = 複製指令碼網址
CallNodeContextMenu--copy-stack = 複製堆疊
CallNodeContextMenu--show-the-function-in-devtools = 於開發者工具中顯示函數

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = 總執行時間（ms）
    .title = 此函數在堆疊上被觀察到出現的「總計」時間長度摘要。包含函數實際執行的時間長度，以及此函數中所呼叫的時間長度。
CallTree--tracing-ms-self = Self（ms）
    .title = 「Self」時間只包含函數在堆疊底部結束時的時間。若此函數是透過其他函數呼叫的，則不會包含「該函數」的時間。「self」時間適合用來了解程式當中實際花費了多少時間在哪些函數上。
CallTree--samples-total = 總計（樣本數）
    .title = 此函數在堆疊上被觀察到出現的「總計」次數摘要。包含函數實際執行的次數，以及此函數中所呼叫的次數。
CallTree--samples-self = Self
    .title = 「Self」樣本數只包含函數在堆疊底部結束的次數。若此函數是透過其他函數呼叫的，則不會包含「該函數」的次數。「self」次數適合用來了解程式當中實際花費了多少時間在哪些函數上。
CallTree--bytes-total = 總大小（位元組數）
    .title = 此函數在堆疊上被觀察到分配或取消分配的「總計」位元組摘要。包含函數實際執行時使用的大小，以及此函數中所呼叫其他函數所使用的記憶體大小。
CallTree--bytes-self = Self（位元組）
    .title = 「Self」位元組數只包含函數在堆疊底部分配到或取消分配到的記憶體用量。若此函數是透過其他函數呼叫的，則不會包含「該函數」的用量。「self」位元組數適合用來了解程式當中實際花費了多少記憶體在哪些函數上。

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = 編譯器內聯了一些對 { $calledFunction } 函數的呼叫。
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = （內聯）
    .title = 編譯器已將一些對 { $calledFunction } 函數的呼叫內聯到 { $outerFunction } 函數。

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = 選擇節點來顯示該節點的相關資訊。
CallTreeSidebar--call-node-details = 呼叫節點詳細資訊

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
    .label = 追蹤執行時間
CallTreeSidebar--traced-self-time =
    .label = 追蹤 Self 時間
CallTreeSidebar--running-time =
    .label = 執行時間
CallTreeSidebar--self-time =
    .label = Self 時間
CallTreeSidebar--running-samples =
    .label = 執行取樣
CallTreeSidebar--self-samples =
    .label = Self 取樣
CallTreeSidebar--running-size =
    .label = 執行大小
CallTreeSidebar--self-size =
    .label = Self 大小
CallTreeSidebar--categories = 分類
CallTreeSidebar--implementation = 實作
CallTreeSidebar--running-milliseconds = 執行時間（ms）
CallTreeSidebar--running-sample-count = 執行取樣數
CallTreeSidebar--running-bytes = 執行位元組
CallTreeSidebar--self-milliseconds = Self 時間（ms）
CallTreeSidebar--self-sample-count = Self 取樣數
CallTreeSidebar--self-bytes = Self 位元組

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = 輸入您想要用來比較的檢測檔網址
CompareHome--instruction-content = 此工具將從每個效能檢測檔當中抽出選擇的軌道與範圍相關資料，並將它們放到相同的畫面上，方便比較。
CompareHome--form-label-profile1 = 檢測檔 1：
CompareHome--form-label-profile2 = 檢測檔 2：
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

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description = 請將此問題報告給開發人員，包含開發者工具當中的 Web 主控台所顯示的完整錯誤。
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = 到 GitHub 回報錯誤

## Footer Links

FooterLinks--legal = 法律資訊
FooterLinks--Privacy = 隱私權
FooterLinks--Cookies = Cookie
FooterLinks--languageSwitcher--select =
    .title = 變更語言
FooterLinks--hide-button =
    .title = 隱藏頁尾鏈結
    .aria-label = 隱藏頁尾鏈結

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> 軌

## Home page

Home--upload-from-file-input-button = 從檔案載入檢測檔
Home--upload-from-url-button = 從網址載入檢測檔
Home--load-from-url-submit-button =
    .value = 載入
Home--documentation-button = 文件
Home--menu-button = 開啟 { -profiler-brand-name } 選單按鈕
Home--menu-button-instructions = 開啟 { -firefox-brand-name } 當中的檢測器選單按鈕開始紀錄效能，然後進行分析並分享到 profiler.firefox.com。
Home--profile-firefox-android-instructions = 您也可以對 { -firefox-android-brand-name } 進行效能檢測。若需更多資訊請參考下列文件：<a>直接於裝置上檢測 { -firefox-android-brand-name } 效能</a>。
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = 此檢測器無法連線到 WebChannel，無法開啟檢測器選單按鈕。
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = 此檢測器無法連線到 WebChannel。通常是因為執行檢測器的主機與 <code>devtools.performance.recording.ui-base-url</code> 偏好設定當中指定的主機不同。若您想要使用此檢測器捕捉新的效能檢測檔，並可程式化控制檢測器選單按鈕，可到 <code>about:config</code> 調整該偏好設定。
Home--record-instructions = 請點擊檢測按鈕或按下鍵盤快速鍵即可開始進行檢測。進行效能紀錄時，此圖示將會顯示成藍色。按下<kbd>捕捉</kbd>即可將資料載入到 profiler.firefox.com。
Home--instructions-content = 需要使用 <a>{ -firefox-brand-name }</a> 紀錄效能檢測檔。但可以使用任何現代瀏覽器檢視現有的檢測檔。
Home--record-instructions-start-stop = 停止或開始檢測
Home--record-instructions-capture-load = 捕捉並載入檢測檔
Home--profiler-motto = 捕捉效能檢測檔。分析、分享、讓網站運作更快。
Home--additional-content-title = 載入現有檢測檔
Home--additional-content-content = 您可以將效能檢測檔<strong>拖曳</strong>到此處，或：
Home--compare-recordings-info = 您也可以比較紀錄內容。<a>開啟比較介面。</a>
Home--your-recent-uploaded-recordings-title = 您近期上傳的紀錄
Home--dark-mode-title = 暗色模式
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 =
    { -profiler-brand-name } 也可以匯入其他效能檢測器，例如 <perf>Linux perf</perf>、<simpleperf>Android SimplePerf</simpleperf>、Chrome 效能面板、<androidstudio>Android Studio</androidstudio> 所產生的效能檢測檔、任何使用 <dhat>dhat 格式</dhat> 或 <traceevent>Google 的 Trace Event
    格式</traceevent>儲存的效能檢測檔。<write>點擊此處了解如何撰寫您自己的匯入程式</write>。
Home--install-chrome-extension = 安裝 Chrome 擴充套件
Home--chrome-extension-instructions = 可使用 <a>Chrome 的 { -profiler-brand-name } 擴充套件</a>，在 Chrome 當中捕捉效能紀錄檔，再使用 { -profiler-brand-name } 進行分析。請到 Chrome 線上應用程式商店安裝此套件。
Home--chrome-extension-recording-instructions = 安裝完成後，即可使用擴充套件在工具列新增的圖示或快速鍵開始或停止捕捉效能紀錄。您也可以匯出檢測檔，匯入此處，進行更詳細的分析。

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
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
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
MarkerContextMenu--copy-page-url = 複製頁面網址
MarkerContextMenu--copy-as-json = 以 JSON 格式複製
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = 選擇接收執行緒「<strong>{ $threadName }</strong>」
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = 選擇傳送執行緒「<strong>{ $threadName }</strong>」

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = 丟棄不符合「<strong>{ $filter }</strong>」標記的取樣

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = 用純文字格式複製標記表
MarkerCopyTableContextMenu--copy-table-as-markdown = 用 Markdown 格式複製標記表

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = 過濾標記：
    .title = 只顯示符合特定名稱的標記
MarkerSettings--marker-filters =
    .title = 標記過濾器
MarkerSettings--copy-table =
    .title = 用純文字複製表格
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = 資料列數超過限制：{ $rows } > { $maxRows }，只複製最前 { $maxRows } 列。

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = 選擇標記來顯示該標記的相關資訊。

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = 開始
MarkerTable--duration = 持續時間
MarkerTable--name = 名稱
MarkerTable--details = 詳細資訊

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = 只顯示符合「{ $filter }」的標記
    .aria-label = 只顯示符合「{ $filter }」的標記

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

MenuButtons--index--profile-info-uploaded-label = 上傳於：
MenuButtons--index--profile-info-uploaded-actions = 刪除
MenuButtons--index--metaInfo-subtitle = 檢測檔資訊
MenuButtons--metaInfo--symbols = 符號：
MenuButtons--metaInfo--profile-symbolicated = 檢測檔已符號化
MenuButtons--metaInfo--profile-not-symbolicated = 檢測檔未符號化
MenuButtons--metaInfo--resymbolicate-profile = 重新將檢測檔符號化
MenuButtons--metaInfo--symbolicate-profile = 符號化檢測檔
MenuButtons--metaInfo--attempting-resymbolicate = 正在嘗試重新符號化檢測檔
MenuButtons--metaInfo--currently-symbolicating = 目前符號化的檢測檔
MenuButtons--metaInfo--cpu-model = CPU 型號：
MenuButtons--metaInfo--cpu-cores = CPU 核心數：
MenuButtons--metaInfo--main-memory = 主要記憶體：
MenuButtons--index--show-moreInfo-button = 顯示更多
MenuButtons--index--hide-moreInfo-button = 顯示更少
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
       *[other]
            { $logicalCPUs ->
               *[other] { $physicalCPUs } 顆實體核心、{ $logicalCPUs } 顆邏輯核心
            }
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
MenuButtons--metaInfo--profiling-started = 紀錄開始於：
MenuButtons--metaInfo--profiling-session = 紀錄長度：
MenuButtons--metaInfo--main-process-started = 主處理程序開始：
MenuButtons--metaInfo--main-process-ended = 主要處理程序結束於：
MenuButtons--metaInfo--file-name = 檔案名稱：
MenuButtons--metaInfo--file-size = 檔案大小：
MenuButtons--metaInfo--interval = 間隔：
MenuButtons--metaInfo--buffer-capacity = 緩衝區容量：
MenuButtons--metaInfo--buffer-duration = 緩衝區長度：
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
MenuButtons--metaInfo--name-and-version = 名稱與版本：
# The time between application startup and when the profiler was started
MenuButtons--metaInfo--application-uptime2 = Uptime：
MenuButtons--metaInfo--update-channel = 更新頻道：
MenuButtons--metaInfo--build-id = Build ID：
MenuButtons--metaInfo--build-type = Build Type：
MenuButtons--metaInfo--arguments = 參數：

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = 除錯
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = 平台
MenuButtons--metaInfo--device = 裝置：
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = OS：
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI：
MenuButtons--metaInfo--visual-metrics = 視覺指標
MenuButtons--metaInfo--speed-index = Speed Index：
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = Perceptual Speed Index：
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = Contentful Speed Index：
MenuButtons--metaInfo-renderRowOfList-label-features = 功能：
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = 執行緒過濾器：
MenuButtons--metaInfo-renderRowOfList-label-extensions = 擴充套件：

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
MenuButtons--metaOverheadStatistics-overhead-duration = 額外負荷持續時間：
MenuButtons--metaOverheadStatistics-overhead-percentage = 額外負荷比例：
MenuButtons--metaOverheadStatistics-profiled-duration = 檢測的持續時間：

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = 包含隱藏的執行緒
MenuButtons--publish--renderCheckbox-label-include-other-tabs = 包含來自其他分頁的資料
MenuButtons--publish--renderCheckbox-label-hidden-time = 包含隱藏的時間範圍
MenuButtons--publish--renderCheckbox-label-include-screenshots = 包含畫面擷圖
MenuButtons--publish--renderCheckbox-label-resource = 包含資源網址與路徑
MenuButtons--publish--renderCheckbox-label-extension = 包含擴充套件資訊
MenuButtons--publish--renderCheckbox-label-preference = 包含偏好設定值
MenuButtons--publish--renderCheckbox-label-private-browsing = 包含來自隱私瀏覽視窗的資料
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = 此效能檢測檔包含隱私瀏覽資料
MenuButtons--publish--reupload-performance-profile = 重新上傳效能檢測檔
MenuButtons--publish--share-performance-profile = 分享效能檢測檔
MenuButtons--publish--info-description = 上傳您的檢測檔並透過鏈結分享，讓任何取得該鏈結的人都能存取。
MenuButtons--publish--info-description-default = 預設情況下，將會移除您的個人資料。
MenuButtons--publish--info-description-firefox-nightly2 = 此檢測檔來自 { -firefox-nightly-brand-name }，預設情況下將包含大部分資訊。
MenuButtons--publish--include-additional-data = 包含其他資料後，可能造成檢測檔可被識別。
MenuButtons--publish--button-upload = 上傳
MenuButtons--publish--upload-title = 正在上傳檢測檔…
MenuButtons--publish--cancel-upload = 取消上傳
MenuButtons--publish--message-something-went-wrong = 哇喔，上傳檢測檔時發生某些錯誤。
MenuButtons--publish--message-try-again = 再試一次
MenuButtons--publish--download = 下載
MenuButtons--publish--compressing = 壓縮中…
MenuButtons--publish--error-while-compressing = 壓縮時發生錯誤，請嘗試取消勾選部分項目來縮小檢測檔。

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = 過濾網路請求：
    .title = 只顯示符合某些名稱的網路請求

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

PanelSearch--search-field-hint = 您知道可以使用半形逗號（,）搜尋多個詞彙嗎？

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = 編輯效能檢測檔名稱
ProfileName--edit-profile-name-input =
    .title = 編輯效能檢測檔名稱
    .aria-label = 效能檢測檔名稱

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = 刪除
    .title = 點擊此處刪除檢測檔 { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = 刪除此效能檢測檔時發生錯誤，<a>將滑鼠移到此處即可了解更多資訊。</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = 刪除 { $profileName }
ProfileDeletePanel--dialog-confirmation-question = 您確定要刪除這份效能檢測檔已上傳的資料嗎？刪除後，先前分享的鏈結將失效。
ProfileDeletePanel--dialog-cancel-button =
    .value = 取消
ProfileDeletePanel--dialog-delete-button =
    .value = 刪除
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = 刪除中…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = 已成功刪除上傳的資料。

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = 完整範圍（{ $fullRangeDuration }）

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = 正在匯入與處理效能檢測檔…
ProfileLoaderAnimation--loading-unpublished = 直接從 { -firefox-brand-name } 匯入檢測檔…
ProfileLoaderAnimation--loading-from-file = 正在讀取檔案並處理檢測檔…
ProfileLoaderAnimation--loading-local = 尚未實作。
ProfileLoaderAnimation--loading-public = 正在下載處理檢測檔…
ProfileLoaderAnimation--loading-from-url = 正在下載處理檢測檔…
ProfileLoaderAnimation--loading-compare = 正在讀取與處理檢測檔…
ProfileLoaderAnimation--loading-view-not-found = 找不到畫面

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = 回到首頁

## Root

Root--error-boundary-message =
    .message = 哇喔，profiler.firefox.com 發生某些未知錯誤。

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = 套用中…
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

StackSettings--implementation-all-frames = 所有堆疊框
    .title = 不過濾堆疊框
StackSettings--implementation-script = 指令碼
    .title = 僅顯示指令碼執行相關的堆疊框
StackSettings--implementation-native2 = 原生
    .title = 僅顯示原生程式碼相關的堆疊框
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = 過濾堆疊：
StackSettings--use-data-source-label = 資料來源：
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
StackSettings--use-stack-chart-same-widths = 將每個堆疊以相同寬度顯示
StackSettings--panel-search =
    .label = 過濾堆疊：
    .title = 只顯示包含符合的子字串的函數名稱的相關堆疊

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = 呼叫樹
TabBar--flame-graph-tab = 火焰圖
TabBar--stack-chart-tab = 堆疊圖
TabBar--marker-chart-tab = 標記圖
TabBar--marker-table-tab = 標記表
TabBar--network-tab = 網路
TabBar--js-tracer-tab = JS 追蹤器

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = 所有分頁與視窗

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = 只顯示此處理程序
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
TrackContextMenu--show-local-tracks-in-process = 顯示此處理程序當中的所有軌道
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = 隱藏所有「{ $type }」類型的軌道
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = 顯示所有符合的軌道
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = 隱藏所有符合的軌道
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = 找不到「<span>{ $searchFilter }</span>」的結果
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = 隱藏軌道
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = 隱藏處理程序

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = 此時的相對記憶體用量
TrackMemoryGraph--memory-range-in-graph = 圖表中的記憶體範圍
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = 上次取樣以來的分配與取消分配

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
    .label = 功率
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = 功率
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = 功率
# This is used in the tooltip when the instant power value uses the microwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-microwatt = { $value } μW
    .label = 功率
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = 目前選擇範圍的平均功率
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = 目前選擇範圍的平均功率
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = 目前選擇範圍的平均功率
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh（{ $carbonValue } kg CO₂e）
    .label = 可見範圍中消耗的能源
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh（{ $carbonValue } g CO₂e）
    .label = 可見範圍中消耗的能源
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh（{ $carbonValue } mg CO₂e）
    .label = 可見範圍中消耗的能源
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh（{ $carbonValue } mg CO₂e）
    .label = 可見範圍中消耗的能源
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh（{ $carbonValue } kg CO₂e）
    .label = 可見範圍中消耗的能源
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh（{ $carbonValue } g CO₂e）
    .label = 目前選擇範圍中消耗的能源
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh（{ $carbonValue } mg CO₂e）
    .label = 目前選擇範圍中消耗的能源
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh（{ $carbonValue } mg CO₂e）
    .label = 目前選擇範圍中消耗的能源

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
TrackBandwidthGraph--speed = 每秒 { $value }
    .label = 此樣本的傳輸速度
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = 自從上次取樣後的讀寫操作數量
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value }（{ $carbonValue } g CO₂e）
    .label = 至此刻為止傳輸的資料量
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value }（{ $carbonValue } g CO₂e）
    .label = 可見範圍中傳輸的資料量
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value }（{ $carbonValue } g CO₂e）
    .label = 目前選擇範圍傳輸的資料量

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = 輸入過濾條件
    .title = 只顯示符合特定文字的軌道

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
TransformNavigator--collapse-resource = 摺疊：{ $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = 聚焦節點：{ $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = 聚焦：{ $item }
# "Focus self" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-on-function-self
# Also see the translation note above CallNodeContextMenu--transform-focus-self.
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-self = 聚焦 self：{ $item }
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = 聚焦於分類：{ $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = 合併節點：{ $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = 合併：{ $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = 丟棄：{ $item }
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = 摺疊遞迴：{ $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = 僅摺疊直接遞迴：{ $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = 摺疊子樹：{ $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = 丟棄不符合「{ $item }」標記的取樣

## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = 等待 { $host }…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = 正在等待 { -firefox-brand-name }…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = 無法取得原始碼
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = 關於支援的使用情境與規劃中的改進，請參考<a>issue #3741</a>。
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = 無法取得機器碼
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = 關於支援的使用情境與規劃中的改進，請參考<a>issue #4520</a>。
SourceView--close-button =
    .title = 關閉原始碼畫面

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = 這個檔案沒有已知的 cross-origin-accessible 網址。
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = 取得網址 { $url } 時發生網路錯誤：{ $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = 無法查詢瀏覽器的符號化 API：{ $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = 瀏覽器的符號化 API 回傳錯誤：{ $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = 本機符號伺服器的符號化 API 回傳錯誤：{ $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = 瀏覽器的符號化 API 回傳異常的回應：{ $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = 本機符號伺服器的符號化 API 回傳異常的回應：{ $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = 下載自 { $url } 的封存檔缺少下列檔案 { $pathInArchive }。
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = 無法剖析下載自 { $url } 的封存檔：{ $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = 瀏覽器無法取得 sourceUuid 為 { $sourceUuid }，位於 { $url } 的原始碼檔案：{ $errorMessage }。

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = 顯示機器碼畫面
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = 隱藏機器碼畫面
# The "◀" button above the assembly view.
AssemblyView--prev-button =
    .title = 上一個
# The "▶" button above the assembly view.
AssemblyView--next-button =
    .title = 下一個
# The label showing the current position and total count above the assembly view.
# Variables:
#   $current (Number) - The current position (1-indexed).
#   $total (Number) - The total count.
AssemblyView--position-label = 第 { $current } 個，共 { $total } 個

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = 已上傳的紀錄檔
