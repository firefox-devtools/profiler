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
    .message = 无法从 { -firefox-brand-name } 检索到分析记录。
AppViewRouter--error-message-from-file =
    .message = 无法读取或解析其中的分析记录。
AppViewRouter--error-message-local =
    .message = 尚未实现。
AppViewRouter--error-message-public =
    .message = 无法下载分析记录。
AppViewRouter--error-message-from-url =
    .message = 无法下载分析记录。
AppViewRouter--route-not-found--home =
    .specialMessage = 无法识别您尝试访问的 URL。

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = 合并函数
    .title = 将函数折叠后，其会从分析记录移除，并将所有时间归予调用该函数的函数。在树中调用该函数的任何地方都会如此。
CallNodeContextMenu--transform-merge-call-node = 只合并节点
    .title = 将节点合并后，其会从分析记录移除，并将所有时间归予调用该节点的函数节点，其他对该函数调用的部分将保留在 Profile 中。
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title = 聚焦于函数，将移除所有不包含该函数的样本。此外，还会重新将调用树的根指定为该函数。如此可将分析记录中的多个函数调用点合并为单个调用节点。
CallNodeContextMenu--transform-focus-function = 聚焦于函数
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = 聚焦于函数（反向）
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-subtree = 只聚焦于子树
    .title = 聚焦于子树，将从调用树中拉出分支，并移除不属于该分支的内容。然而此功能只对单一调用节点有效，将忽略其他调用该函数的部分。
CallNodeContextMenu--transform-collapse-function-subtree = 折叠函数
    .title = 将函数折叠后，会移除其所有调用内容，并将所有时间归予该函数。此举可避免对不需要分析的代码进行调用，简化分析记录本身。
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = 折叠 <strong>{ $nameForResource }</strong>
    .title = 折叠资源可将所有对该资源的调用，扁平化为已折叠的单个调用节点。
CallNodeContextMenu--transform-collapse-direct-recursion = 折叠直接递归
    .title = 折叠直接递归可移除对相同函数的重复递归调用。
CallNodeContextMenu--transform-drop-function = 丢弃与此函数相关的样本
    .title = 将样本丢弃后，会从分析记录移除这些样本的时间。在需要清除与分析无关的计时信息时，十分有用。
CallNodeContextMenu--expand-all = 全部展开
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = 用 Searchfox 搜索函数名称
CallNodeContextMenu--copy-function-name = 复制函数名称
CallNodeContextMenu--copy-script-url = 复制脚本 URL
CallNodeContextMenu--copy-stack = 复制栈

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = 总运行时间（ms）
    .title = 此函数在栈上被观察到出现的“总计”时长汇总。包含函数实际运行的时长，以及此函数中所调用的时长。
CallTree--tracing-ms-self = Self（ms）
    .title = “Self”时间只包含函数在栈底结束时的时间。若此函数是通过其他函数调用的，则不包含“该函数”的时间。“self”时间适合用于了解程序中实际用了多长时间在哪些函数上。
CallTree--samples-total = 总计（样本数）
    .title = 此函数在栈上被观察到出现的“总计”次数汇总。包含实际运行的的次数，以及此函数中所调用的次数。
CallTree--samples-self = Self
    .title = “Self”样本数只包含函数在栈底结束时的次数。若此函数是通过其他函数调用的，则不包含“该函数”的次数。“self”次数适合用于了解程序中实际用了多长时间在哪些函数上。
CallTree--bytes-total = 总大小（字节）
    .title = 此函数在栈上被观察到分配或释放的“总计”字节汇总。包含函数实际运行时使用的大小，以及此函数中所调用其他函数所用的内存大小。
CallTree--bytes-self = Self（字节）
    .title = “Self”字节数只包含函数在栈底分配或释放的内存用量。若此函数是通过其他函数调用的，则不包含“该函数”的用量。“Self”字节数适合用于了解程序中实际用了多少内存在哪些函数上。

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = 选择节点即可显示它的相关信息。

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = 输入您想要比较的分析记录的 URL
CompareHome--instruction-content = 该工具将从每份分析记录中提取选定的轨道和范围相关数据，并将它们放到同一视图，以便比较。
CompareHome--form-label-profile1 = 分析记录 1：
CompareHome--form-label-profile2 = 分析记录 2：
CompareHome--submit-button =
    .value = 检索分析记录

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.

DebugWarning--warning-message =
    .message = 此分析记录来自未经发行优化的构建版本。所作性能观察可能不适用于一般发行版用户。

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
# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-visible = 可见 <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> 轨

## Home page

Home--upload-from-file-input-button = 从文件加载分析记录
Home--upload-from-url-button = 从 URL 加载分析记录
Home--load-from-url-submit-button =
    .value = 加载
Home--documentation-button = 文档
Home--menu-button = 启用 { -profiler-brand-name } 菜单按钮
Home--menu-button-instructions = 启用分析器菜单按钮，即可在 { -firefox-brand-name } 中记录性能，然后进行剖析并分享至 profiler.firefox.com。
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = 此分析器无法连接至 WebChannel，无法启用分析器菜单按钮。
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = 此分析器无法连接至 WebChannel。通常是因为运行分析器的主机与 <code>devtools.performance.recording.ui-base-url</code> 首选项中指定的主机不同。若您想要使用此分析器捕捉新的性能分析记录，并可程序化控制分析器菜单按钮，可到 <code>about:config</code> 调整该首选项。
Home--record-instructions = 要进行分析，请点击“分析”按钮，或使用键盘快捷键。在性能记录时，此图标将会变为蓝色。按下<kbd>捕捉</kbd>即可将数据加载至 profiler.firefox.com。
Home--instructions-title = 如何查看并记录分析结果
Home--instructions-content = 需使用 <a>{ -firefox-brand-name }</a> 记录性能分析信息。但可以使用任何现代浏览器查看现有分析记录。
Home--record-instructions-start-stop = 停止并开始分析
Home--record-instructions-capture-load = 捕捉并加载分析记录
Home--profiler-motto = 捕捉性能分析记录。剖析、分享、让网站速度更快。
Home--additional-content-title = 加载现有分析记录
Home--additional-content-content = 您可以将分析记录<strong>拖放</strong>至此处，或：
Home--compare-recordings-info = 您也可以比较记录内容。<a>打开比较界面。</a>
Home--recent-uploaded-recordings-title = 近期上传的记录

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = 输入过滤条件

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.

JsTracerSettings--show-only-self-time = 只显示 self 时间
    .title = 只显示调用节点所用的时间，而忽略其 children。

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = 点击此处加载分析记录 { $smallProfileName }
ListOfPublishedProfiles--published-profiles-delete-button-disabled = 删除
    .title = 由于缺少授权信息，无法删除此 Profile。
ListOfPublishedProfiles--uploaded-profile-information-list-empty = 还未上传任何分析记录！
# This string is used below the 'Recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = 查看并管理您的所有记录（还有 { $profilesRestCount } 条）
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] 管理此记录
       *[other] 管理下列记录
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = 根据标记的持续时间选择
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

MarkerSettings--panel-search =
    .label = 过滤标记：
    .title = 只显示匹配特定名称的标记

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = 选择标记即可显示其相关信息。

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = 开始
MarkerTable--duration = 持续时间
MarkerTable--type = 类型
MarkerTable--description = 描述

## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = “分析记录”信息
MenuButtons--index--full-view = 全视图
MenuButtons--index--cancel-upload = 取消上传
MenuButtons--index--share-upload =
    .label = 上传本地分析记录
MenuButtons--index--share-re-upload =
    .label = 重新上传
MenuButtons--index--share-error-uploading =
    .label = 上传时出错
MenuButtons--index--revert = 恢复到原始分析记录
MenuButtons--index--docs = 文档
MenuButtons--permalink--button =
    .label = 固定链接

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = 上传于：
MenuButtons--index--profile-info-uploaded-actions = 删除
MenuButtons--index--metaInfo-subtitle = “分析记录”信息
MenuButtons--metaInfo--symbols = 符号：
MenuButtons--metaInfo--profile-symbolicated = 分析记录已符号化
MenuButtons--metaInfo--profile-not-symbolicated = 分析记录未符号化
MenuButtons--metaInfo--resymbolicate-profile = 重新将分析记录符号化
MenuButtons--metaInfo--symbolicate-profile = 符号化分析记录
MenuButtons--metaInfo--attempting-resymbolicate = 正在尝试重新符号化分析记录
MenuButtons--metaInfo--currently-symbolicating = 当前符号化的分析记录
MenuButtons--metaInfo--cpu = CPU：
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
       *[other] 物理核心 × { $physicalCPUs }
    }、{ $logicalCPUs ->
       *[other] 逻辑核心 × { $logicalCPUs }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
       *[other] 物理核心 × { $physicalCPUs }
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
       *[other] 逻辑核心 × { $logicalCPUs }
    }
MenuButtons--metaInfo--recording-started = 记录开始于：
MenuButtons--metaInfo--interval = 间隔：
MenuButtons--metaInfo--profile-version = 分析记录版本：
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
MenuButtons--metaInfo--build-type-opt = Opt

##

MenuButtons--metaInfo--platform = 平台
MenuButtons--metaInfo--device = 设备：
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = OS:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI：
MenuButtons--metaInfo--visual-metrics = 视觉指标
MenuButtons--metaInfo--speed-index = 速度指标：
# “Perceptual” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--perceptual-speed-index = 感知速度指标：
# “Contentful” is the name of an index provided by sitespeed.io, and should be kept in English.
MenuButtons--metaInfo--contentful-speed-Index = 内容速度指标：
MenuButtons--metaInfo-renderRowOfList-label-features = 功能：
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = 线程过滤器：
MenuButtons--metaInfo-renderRowOfList-label-extensions = 扩展：

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = { -profiler-brand-short-name } 开销
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
MenuButtons--metaOverheadStatistics-profiled-duration = 分析的持续时间：

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = 包含隐藏的线程
MenuButtons--publish--renderCheckbox-label-hidden-time = 包含隐藏的时间范围
MenuButtons--publish--renderCheckbox-label-include-screenshots = 包含快照
MenuButtons--publish--renderCheckbox-label-resource = 包括资源 URL 和路径
MenuButtons--publish--renderCheckbox-label-extension = 包含扩展信息
MenuButtons--publish--renderCheckbox-label-preference = 包含首选项值
MenuButtons--publish--reupload-performance-profile = 重新上传性能分析记录
MenuButtons--publish--share-performance-profile = 分享性能分析记录
MenuButtons--publish--info-description = 上传您的分析记录，并通过链接分享给任何人。
MenuButtons--publish--info-description-default = 默认情况下，将会移除您的个人数据。
MenuButtons--publish--info-description-firefox-nightly = 此分析记录来自 { -firefox-nightly-brand-name }，默认情况下将包含所有信息。
MenuButtons--publish--include-additional-data = 包括其他数据后，可能造成分析记录可被识别
MenuButtons--publish--button-upload = 上传
MenuButtons--publish--upload-title = 正在上传分析记录…
MenuButtons--publish--cancel-upload = 取消上传
MenuButtons--publish--message-something-went-wrong = 啊哦，上传分析记录时出了点问题。
MenuButtons--publish--message-try-again = 再试一次
MenuButtons--publish--download = 下载
MenuButtons--publish--compressing = 正在压缩…

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = 过滤网络请求：
    .title = 只显示匹配某些名称的网络请求

## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = 您知道可以使用半角逗号（,）搜索多个词条吗？

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = 删除
    .title = 点击此处删除 Profile { $smallProfileName }

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

ProfileFilterNavigator--full-range = 完整范围

## Profile Loader Animation

ProfileLoaderAnimation--loading-message-unpublished =
    .message = 正在直接从 { -firefox-brand-name } 导入分析记录…
ProfileLoaderAnimation--loading-message-from-file =
    .message = 正在读取文件并处理分析记录…
ProfileLoaderAnimation--loading-message-local =
    .message = 尚未实现。
ProfileLoaderAnimation--loading-message-public =
    .message = 正在下载处理分析记录…
ProfileLoaderAnimation--loading-message-from-url =
    .message = 正在下载处理分析记录…
ProfileLoaderAnimation--loading-message-compare =
    .message = 正在读取和处理分析记录…
ProfileLoaderAnimation--loading-message-view-not-found =
    .message = 找不到视图

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = 返回主页

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--installing-button = 正在安装…
ServiceWorkerManager--pending-button = 应用并重新加载
ServiceWorkerManager--installed-button = 重新加载应用程序
ServiceWorkerManager--updated-while-not-ready =
    在此页面完整加载前，已有新版应用程序生效。
    
    您可能会遇到些许异常。
ServiceWorkerManager--new-version-is-ready = 该应用程序的新版本已下载，随时可安装。
ServiceWorkerManager--hide-notice-button =
    .title = 隐藏重新加载通知
    .aria-label = 隐藏重新加载通知

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-stacks = 所有栈
StackSettings--implementation-javascript = JavaScript
StackSettings--implementation-native = 原生
StackSettings--use-data-source-label = 数据源：
StackSettings--call-tree-strategy-timing = 计时
    .title = 使用时间推移下已执行代码的采样栈进行汇总
StackSettings--call-tree-strategy-js-allocations = JavaScript 分配
    .title = 显示 JavaScript 分配到的字节数汇总（不含释放）
StackSettings--call-tree-strategy-native-retained-allocations = 保留的内存
    .title = 根据分配到且在目前选择的预览范围中，从未释放的内存字节数进行汇总
StackSettings--call-tree-native-allocations = 分配到的内存
    .title = 根据分配到的内存字节数进行汇总
StackSettings--call-tree-strategy-native-deallocations-memory = 释放的内存
    .title = 按照分配到内存的位置，根据释放的内存字节数进行汇总
StackSettings--call-tree-strategy-native-deallocations-sites = 释放的位置
    .title = 按照取释放内存的位置，根据释放的内存字节数进行汇总
StackSettings--invert-call-stack = 反转调用栈
    .title = 按照调用节点中所用时间排序，并忽略其 children。
StackSettings--show-user-timing = 显示用户计时
StackSettings--panel-search =
    .label = 过滤栈：
    .title = 只显示包含匹配的子字符串的函数名称的相关栈

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = 调用树
TabBar--flame-graph-tab = 火焰图
TabBar--stack-chart-tab = 栈图
TabBar--marker-chart-tab = 标记图
TabBar--marker-table-tab = 标记表
TabBar--network-tab = 网络
TabBar--js-tracer-tab = JS 追踪器

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process-group = 只显示此进程组
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = 只显示“{ $trackName }”
TrackContextMenu--hide-other-screenshots-tracks = 隐藏其他快照轨
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = 隐藏“{ $trackName }”
TrackContextMenu--show-all-tracks = 显示所有轨道

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

UploadedRecordingsHome--title = 已上传的分析记录
