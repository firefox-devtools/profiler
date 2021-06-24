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

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--form-label-profile1 = 檢測檔 1:
CompareHome--form-label-profile2 = 檢測檔 2:
CompareHome--submit-button =
    .value = 取得檢測檔

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


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
Home--addon-button = 安裝附加元件
Home--instructions-title = 如何檢視並記錄檢測檔
Home--record-instructions-start-stop = 停止並開始檢測
Home--record-instructions-capture-load = 捕捉並載入檢測檔
Home--profiler-motto = 捕捉效能檢測檔。分析、分享、讓網站運作更快。
Home--additional-content-title = 載入現有檢測檔
Home--recent-uploaded-recordings-title = 近期上傳的紀錄

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = 輸入過濾條件

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = 點擊此處載入檢測檔 { $smallProfileName }
ListOfPublishedProfiles--uploaded-profile-information-list-empty = 還沒有上傳任何檢測檔！

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.


## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.


## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.


## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.


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

