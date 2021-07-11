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

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>{ -firefox-brand-name } 性能分析网页应用程序</subheader>
AppHeader--github-icon =
    .title = 前往我们的 Git 仓库（新建窗口打开）

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-message-unpublished =
    .message = 无法从 { -firefox-brand-name } 检索到 Profile。
AppViewRouter--error-message-from-file =
    .message = 无法读取或解析其中的 Profile。
AppViewRouter--error-message-local =
    .message = 尚未实现。
AppViewRouter--error-message-public =
    .message = 无法下载 Profile。
AppViewRouter--error-message-from-url =
    .message = 无法下载 Profile。
AppViewRouter--route-not-found--home =
    .specialMessage = 无法识别您尝试访问的 URL。

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-focus-function = 聚焦于函数
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = 聚焦于函数（反向）
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = 只聚焦于子树
    .title = 聚焦于子树，将从调用树中拉出分支，并移除不属于该分支的内容。然而此功能只对单一调用节点有效，将忽略其他调用该函数的部分。
CallNodeContextMenu--transform-collapse-function-subtree = 折叠函数
    .title = 将函数折叠后，会移除其所有调用内容，并将所有时间归予该函数。此举可避免对不需要分析的代码进行调用，简化 Profile。
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = 折叠 <strong>{ $nameForResource }</strong>
    .title = 折叠资源可将所有对该资源的调用，扁平化为已折叠的单个调用节点。
CallNodeContextMenu--transform-collapse-direct-recursion = 折叠直接递归
    .title = 折叠直接递归可移除对相同函数的重复递归调用。
CallNodeContextMenu--expand-all = 全部展开
CallNodeContextMenu--copy-function-name = 复制函数名称
CallNodeContextMenu--copy-script-url = 复制脚本 URL
CallNodeContextMenu--copy-stack = 复制栈

## CallTree
## This is the component for Call Tree panel.


## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.


## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/


## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = 打开侧栏
Details--close-sidebar-button =
    .title = 关闭侧栏
Details--error-boundary-message =
    .message = 啊哦，此面板发生某些未知错误。

## Footer Links

FooterLinks--legal = 法律
FooterLinks--Privacy = 隐私
FooterLinks--Cookies = Cookie

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

FullTimeline--graph-type = 图标类型：
FullTimeline--categories-with-cpu = 含 CPU 的分类
FullTimeline--categories = 分类
FullTimeline--stack-height = 栈深度

## Home page

Home--load-from-url-submit-button =
    .value = 加载
Home--documentation-button = 文档
Home--menu-button = 启用 { -profiler-brand-name } 菜单按钮
Home--addon-button = 安装附加组件
Home--recent-uploaded-recordings-title = 近期上传的记录

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = 输入过滤条件

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.


## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--start-selection-here = 从此处开始选择
MarkerContextMenu--end-selection-here = 至此处结束选择
MarkerContextMenu--start-selection-at-marker-start = 从标记的<strong>起点</strong>开始选择
MarkerContextMenu--start-selection-at-marker-end = 从标记的<strong>终点</strong>开始选择
MarkerContextMenu--end-selection-at-marker-start = 至标记的<strong>起点</strong>结束选择
MarkerContextMenu--end-selection-at-marker-end = 至标记的<strong>终点</strong>结束选择
MarkerContextMenu--copy-description = 复制描述
MarkerContextMenu--copy-call-stack = 复制调用栈
MarkerContextMenu--copy-url = 复制 URL
MarkerContextMenu--copy-full-payload = 复制完整载荷

## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = 开始
MarkerTable--type = 类型
MarkerTable--description = 描述

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--full-view = 全视图
MenuButtons--index--cancel-upload = 取消上传
MenuButtons--index--share-re-upload =
    .label = 重新上传
MenuButtons--index--share-error-uploading =
    .label = 上传时出错
MenuButtons--index--docs = 文档
MenuButtons--permalink--button =
    .label = 固定链接

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = 上传于：
MenuButtons--index--profile-info-uploaded-actions = 删除
MenuButtons--metaInfo--symbols = 符号：
MenuButtons--metaInfo--cpu = CPU：
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
       *[other] { $physicalCPUs } 颗物理核心
    }、{ $logicalCPUs ->
       *[other] { $logicalCPUs } 颗逻辑核心
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
       *[other] { $physicalCPUs } 颗物理核心
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
       *[other] { $logicalCPUs } 颗逻辑核心
    }
MenuButtons--metaInfo--interval = 间隔：
MenuButtons--metaInfo--buffer-capacity = 缓冲容量：
MenuButtons--metaInfo--buffer-duration = 缓冲间隔：
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
       *[other] { $configurationDuration } 秒
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = 无限制
MenuButtons--metaInfo--application = 应用程序
MenuButtons--metaInfo--name-and-version = 名称和版本：
MenuButtons--metaInfo--update-channel = 更新通道:
MenuButtons--metaInfo--build-id = 构建 ID：
MenuButtons--metaInfo--build-type = 构建类型：

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = 调试

##

MenuButtons--metaInfo--platform = 平台
MenuButtons--metaInfo--device = 设备：
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = OS:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI：
MenuButtons--metaInfo--visual-metrics = 视觉指标
MenuButtons--metaInfo--speed-index = 速度指标：
MenuButtons--metaInfo-renderRowOfList-label-features = 功能：
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = 线程过滤器：
MenuButtons--metaInfo-renderRowOfList-label-extensions = 扩展：

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-mean = 平均
MenuButtons--metaOverheadStatistics-max = 最大值
MenuButtons--metaOverheadStatistics-min = 最小值
MenuButtons--metaOverheadStatistics-statkeys-overhead = 开销
    .title = 用于采样所有线程的时间。
MenuButtons--metaOverheadStatistics-statkeys-cleaning = 清理
    .title = 用于清理过期数据的时间。
MenuButtons--metaOverheadStatistics-statkeys-counter = 计数
    .title = 用于收集所有计数器的时间。
MenuButtons--metaOverheadStatistics-statkeys-interval = 间隔
    .title = 两次采样间的间隔。
MenuButtons--metaOverheadStatistics-statkeys-lockings = 锁定
    .title = 进行采样前锁定所需的时间。
MenuButtons--metaOverheadStatistics-overhead-duration = 开销持续时间：
MenuButtons--metaOverheadStatistics-overhead-percentage = 开销占比：

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = 包含隐藏的线程
MenuButtons--publish--renderCheckbox-label-hidden-time = 包含隐藏的时间范围
MenuButtons--publish--renderCheckbox-label-include-screenshots = 包含快照
MenuButtons--publish--renderCheckbox-label-resource = 包括资源 URL 和路径
MenuButtons--publish--renderCheckbox-label-extension = 包含扩展信息
MenuButtons--publish--renderCheckbox-label-preference = 包含首选项值
MenuButtons--publish--info-description-default = 默认情况下，将会移除您的个人数据。
MenuButtons--publish--button-upload = 上传
MenuButtons--publish--cancel-upload = 取消上传
MenuButtons--publish--message-try-again = 再试一次
MenuButtons--publish--download = 下载
MenuButtons--publish--compressing = 正在压缩…

## NetworkSettings
## This is used in the network chart.


## PanelSearch
## The component that is used for all the search input hints in the application.


## Profile Delete Button


## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.


## Profile Loader Animation


## ProfileRootMessage

ProfileRootMessage--additional = 返回主页

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = 正在安装…
ServiceWorkerManager--pending-button = 应用并重新加载
ServiceWorkerManager--installed-button = 重新加载应用程序
ServiceWorkerManager--hide-notice-button =
    .title = 隐藏重新加载通知
    .aria-label = 隐藏重新加载通知

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = 原生
StackSettings--use-data-source-label = 数据源：
StackSettings--show-user-timing = 显示用户计时
StackSettings--panel-search =
    .label = 过滤栈：
    .title = 只显示包含匹配的子字符串的函数名称的相关栈

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = 调用树
TabBar--flame-graph-tab = 火焰图
TabBar--stack-chart-tab = 栈图
TabBar--network-tab = 网络

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = 只显示此进程组
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = 只显示“{ $trackName }”
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = 隐藏“{ $trackName }”

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
TransformNavigator--complete = 完成“{ $item }”
# "Collapse resource" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the resource that collapsed. E.g.: libxul.so.
TransformNavigator--collapse-resource = 折叠：{ $item }
# "Focus subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-subtree = 聚焦节点：{ $item }
# "Focus function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--focus-function = 聚焦：{ $item }
# "Merge call node" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-call-node = 合并节点：{ $item }
# "Merge function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=merge
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--merge-function = 合并：{ $item }
# "Drop function" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=drop
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--drop-function = 丢弃：{ $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion = 折叠递归：{ $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = 折叠子树：{ $item }

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

