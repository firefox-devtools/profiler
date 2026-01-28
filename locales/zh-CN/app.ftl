# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Android 版 Firefox
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

AppViewRouter--error-from-post-message = 无法导入分析记录。
AppViewRouter--error-unpublished = 无法从 { -firefox-brand-name } 检索到分析记录。
AppViewRouter--error-from-file = 无法读取或解析其中的分析记录。
AppViewRouter--error-local = 尚未实现。
AppViewRouter--error-public = 无法下载分析记录。
AppViewRouter--error-from-url = 无法下载分析记录。
AppViewRouter--error-compare = 无法获取分析记录。
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari = 由于 <a>Safari 浏览器的特殊限制</a>，{ -profiler-brand-name } 无法使用此浏览器从本地导入分析记录。请在 { -firefox-brand-name } 或 Chrome 中打开此页面。
    .title = Safari 浏览器无法导入本地性能分析记录
AppViewRouter--route-not-found--home =
    .specialMessage = 无法识别您尝试访问的 URL。

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = （已内联）
    .title = 编译器已将 { $function } 内联至其调用方。

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = 显示 <strong>{ $fileName }</strong>
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

##

CallNodeContextMenu--transform-focus-subtree = 只聚焦于子树
    .title = 聚焦于子树，将从调用树中拉出分支，并移除不属于该分支的内容。然而此功能只对单一调用节点有效，将忽略其他调用该函数的部分。
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = 聚集于分类 <strong>{ $categoryName }</strong>
    .title = 聚焦于与选择的节点相同的分类，因此会将属于其他分类的节点合并。
CallNodeContextMenu--transform-collapse-function-subtree = 折叠函数
    .title = 将函数折叠后，会移除其所有调用内容，并将所有时间归予该函数。此举可避免对不需要分析的代码进行调用，简化分析记录本身。
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = 折叠 <strong>{ $nameForResource }</strong>
    .title = 折叠资源可将所有对该资源的调用，扁平化为已折叠的单个调用节点。
CallNodeContextMenu--transform-collapse-recursion = 取消递归
    .title = 取消递归会删除同一函数的重复递归调用，也适用于栈上立即调用的函数
CallNodeContextMenu--transform-collapse-direct-recursion-only = 仅取消直接递归
    .title = 取消直接递归会删除同一函数的重复递归调用，不适用于栈上立即调用的函数
CallNodeContextMenu--transform-drop-function = 丢弃与此函数相关的样本
    .title = 将样本丢弃后，会从分析记录移除这些样本的时间。在需要清除与分析无关的计时信息时，十分有用。
CallNodeContextMenu--expand-all = 全部展开
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = 用 Searchfox 搜索函数名称
CallNodeContextMenu--copy-function-name = 复制函数名称
CallNodeContextMenu--copy-script-url = 复制脚本 URL
CallNodeContextMenu--copy-stack = 复制栈
CallNodeContextMenu--show-the-function-in-devtools = 在开发者工具中显示函数

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

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = 编译器内联了一些对 { $calledFunction } 函数的调用。
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = （内联）
    .title = 编译器已将一些对 { $calledFunction } 函数的调用内联到 { $outerFunction } 函数。

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = 选择节点即可显示它的相关信息。
CallTreeSidebar--call-node-details = 调用节点详情

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
    .label = 跟踪所得运行耗时
CallTreeSidebar--traced-self-time =
    .label = 跟踪所得自身耗时
CallTreeSidebar--running-time =
    .label = 运行耗时
CallTreeSidebar--self-time =
    .label = 自身耗时
CallTreeSidebar--running-samples =
    .label = 运行样本
CallTreeSidebar--self-samples =
    .label = 自身样本
CallTreeSidebar--running-size =
    .label = 运行大小
CallTreeSidebar--self-size =
    .label = 自身大小
CallTreeSidebar--categories = 类别
CallTreeSidebar--implementation = 实现
CallTreeSidebar--running-milliseconds = 运行毫秒数
CallTreeSidebar--running-sample-count = 运行样本数
CallTreeSidebar--running-bytes = 运行字节数
CallTreeSidebar--self-milliseconds = 自身毫秒数
CallTreeSidebar--self-sample-count = 自身样本数
CallTreeSidebar--self-bytes = 自身字节数

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

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description = 请将此问题报告给开发者，包含开发者工具的 Web 控制台中显示的完整错误。
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = 到 GitHub 报告错误

## Footer Links

FooterLinks--legal = 法律
FooterLinks--Privacy = 隐私
FooterLinks--Cookies = Cookie
FooterLinks--languageSwitcher--select =
    .title = 更改语言
FooterLinks--hide-button =
    .title = 隐藏页脚链接
    .aria-label = 隐藏页脚链接

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> 轨

## Home page

Home--upload-from-file-input-button = 从文件加载分析记录
Home--upload-from-url-button = 从 URL 加载分析记录
Home--load-from-url-submit-button =
    .value = 加载
Home--documentation-button = 文档
Home--menu-button = 启用 { -profiler-brand-name } 菜单按钮
Home--menu-button-instructions = 启用分析器菜单按钮，即可在 { -firefox-brand-name } 中记录性能，然后进行剖析并分享至 profiler.firefox.com。
Home--profile-firefox-android-instructions =
    您还可以分析 { -firefox-android-brand-name }，
    详见此文档：
    <a>直接在设备上分析 { -firefox-android-brand-name }</a>。
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = 此分析器无法连接至 WebChannel，无法启用分析器菜单按钮。
# The word WebChannel, the pref name, and the string "about:config" should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ .
Home--web-channel-unavailable = 此分析器无法连接至 WebChannel。通常是因为运行分析器的主机与 <code>devtools.performance.recording.ui-base-url</code> 首选项中指定的主机不同。若您想要使用此分析器捕捉新的性能分析记录，并可程序化控制分析器菜单按钮，可到 <code>about:config</code> 调整该首选项。
Home--record-instructions = 要进行分析，请点击“分析”按钮，或使用键盘快捷键。在性能记录时，此图标将会变为蓝色。按下<kbd>捕捉</kbd>即可将数据加载至 profiler.firefox.com。
Home--instructions-content = 需使用 <a>{ -firefox-brand-name }</a> 记录性能分析信息。但可以使用任何现代浏览器查看现有分析记录。
Home--record-instructions-start-stop = 停止并开始分析
Home--record-instructions-capture-load = 捕捉并加载分析记录
Home--profiler-motto = 捕捉性能分析记录。剖析、分享、让网站速度更快。
Home--additional-content-title = 加载现有分析记录
Home--additional-content-content = 您可以将分析记录<strong>拖放</strong>至此处，或：
Home--compare-recordings-info = 您也可以比较记录内容。<a>打开比较界面。</a>
Home--your-recent-uploaded-recordings-title = 您最近上传的记录
# We replace the elements such as <perf> and <simpleperf> with links to the
# documentation to use these tools.
Home--load-files-from-other-tools2 = { -profiler-brand-name } 也可以从其他分析器导入记录，例如 <perf>Linux perf</perf>、<simpleperf>Android SimplePerf</simpleperf>、Chrome 性能面板、<androidstudio>Android Studio</androidstudio>，支持直接导入 <dhat>dhat</dhat>、<traceevent>Google 的 Trace Event</traceevent> 格式保存的分析记录。<write>点此了解如何编写您自己的导入程序</write>。
Home--install-chrome-extension = 安装 Chrome 扩展
Home--chrome-extension-instructions = 使用 <a>Chrome 版 { -profiler-brand-name } 扩展</a>，在 Chrome 中捕捉性能分析记录，并通过 { -profiler-brand-name } 分析。可到 Chrome 应用商店安装扩展。
Home--chrome-extension-recording-instructions = 安装后，即可使用扩展的工具栏图标和快捷键来开始或停止分析，也可以导出分析记录并在此处加载以进行详细分析。

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
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
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
MarkerContextMenu--copy-page-url = 复制页面网址
MarkerContextMenu--copy-as-json = 复制为 JSON 格式
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = 选择 Receiver 线程“<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = 选择 Sender 线程“<strong>{ $threadName }</strong>”

## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.

# This string is used on the marker filters menu item when clicked on the filter icon.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerFiltersContextMenu--drop-samples-outside-of-markers-matching = 丢弃与标记（匹配条件：“<strong>{ $filter }</strong>”）不相关的样本

## MarkerCopyTableContextMenu
## This is the menu when the copy icon is clicked in Marker Chart and Marker
## Table panels.

MarkerCopyTableContextMenu--copy-table-as-plain = 以纯文本格式复制标记表格
MarkerCopyTableContextMenu--copy-table-as-markdown = 以 Markdown 格式复制标记表格

## MarkerSettings
## This is used in all panels related to markers.

MarkerSettings--panel-search =
    .label = 过滤标记：
    .title = 只显示匹配特定名称的标记
MarkerSettings--marker-filters =
    .title = 标记过滤器
MarkerSettings--copy-table =
    .title = 以文本格式复制表格
# This string is used when the user tries to copy a marker table with
# more than 10000 rows.
# Variable:
#   $rows (Number) - Number of rows the marker table has
#   $maxRows (Number) - Number of maximum rows that can be copied
MarkerSettings--copy-table-exceeed-max-rows = 行数超出限制：{ $rows } > { $maxRows }，将仅复制前 { $maxRows } 行。

## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.

MarkerSidebar--select-a-marker = 选择标记即可显示其相关信息。

## MarkerTable
## This is the component for Marker Table panel.

MarkerTable--start = 开始
MarkerTable--duration = 持续时间
MarkerTable--name = 名称
MarkerTable--details = 详情

## MarkerTooltip
## This is the component for Marker Tooltip panel.

# This is used as the tooltip for the filter button in marker tooltips.
# Variables:
#   $filter (String) - Search string that will be used to filter the markers.
MarkerTooltip--filter-button-tooltip =
    .title = 仅显示匹配“{ $filter }”的标记
    .aria-label = 仅显示匹配“{ $filter }”的标记

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
    .label = 永久链接

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = 上传于：
MenuButtons--index--profile-info-uploaded-actions = 删除
MenuButtons--index--metaInfo-subtitle = “分析记录”信息
MenuButtons--metaInfo--symbols = 符号：
MenuButtons--metaInfo--profile-symbolicated = 分析记录已符号化
MenuButtons--metaInfo--profile-not-symbolicated = 分析记录未符号化
MenuButtons--metaInfo--resymbolicate-profile = 重新符号化分析记录
MenuButtons--metaInfo--symbolicate-profile = 符号化分析记录
MenuButtons--metaInfo--attempting-resymbolicate = 正在尝试重新符号化分析记录
MenuButtons--metaInfo--currently-symbolicating = 当前符号化的分析记录
MenuButtons--metaInfo--cpu-model = CPU 型号：
MenuButtons--metaInfo--cpu-cores = CPU 核心：
MenuButtons--metaInfo--main-memory = 主内存：
MenuButtons--index--show-moreInfo-button = 显示更多
MenuButtons--index--hide-moreInfo-button = 显示更少
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
       *[other]
            { $logicalCPUs ->
               *[other] 物理核心 × { $physicalCPUs }、逻辑核心 × { $logicalCPUs }
            }
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
MenuButtons--metaInfo--profiling-started = 记录开始于：
MenuButtons--metaInfo--profiling-session = 记录长度：
MenuButtons--metaInfo--main-process-started = 主进程开始：
MenuButtons--metaInfo--main-process-ended = 主进程结束：
MenuButtons--metaInfo--file-name = 文件名：
MenuButtons--metaInfo--file-size = 文件大小：
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
MenuButtons--metaInfo--application-uptime = 运行时间：
MenuButtons--metaInfo--update-channel = 更新通道:
MenuButtons--metaInfo--build-id = 构建 ID：
MenuButtons--metaInfo--build-type = 构建类型：
MenuButtons--metaInfo--arguments = 参数：

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
MenuButtons--publish--renderCheckbox-label-include-other-tabs = 包含来自其他标签页的数据
MenuButtons--publish--renderCheckbox-label-hidden-time = 包含隐藏的时间范围
MenuButtons--publish--renderCheckbox-label-include-screenshots = 包含快照
MenuButtons--publish--renderCheckbox-label-resource = 包括资源 URL 和路径
MenuButtons--publish--renderCheckbox-label-extension = 包含扩展信息
MenuButtons--publish--renderCheckbox-label-preference = 包含首选项值
MenuButtons--publish--renderCheckbox-label-private-browsing = 包含来自隐私浏览窗口的数据
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = 此分析记录包含隐私浏览数据
MenuButtons--publish--reupload-performance-profile = 重新上传性能分析记录
MenuButtons--publish--share-performance-profile = 分享性能分析记录
MenuButtons--publish--info-description = 上传您的分析记录，并通过链接分享给任何人。
MenuButtons--publish--info-description-default = 默认情况下，将会移除您的个人数据。
MenuButtons--publish--info-description-firefox-nightly2 = 此分析记录来自 { -firefox-nightly-brand-name }，默认情况下将包含大部分信息。
MenuButtons--publish--include-additional-data = 包括其他数据后，可能造成分析记录可被识别
MenuButtons--publish--button-upload = 上传
MenuButtons--publish--upload-title = 正在上传分析记录…
MenuButtons--publish--cancel-upload = 取消上传
MenuButtons--publish--message-something-went-wrong = 啊哦，上传分析记录时出了点问题。
MenuButtons--publish--message-try-again = 再试一次
MenuButtons--publish--download = 下载
MenuButtons--publish--compressing = 正在压缩…
MenuButtons--publish--error-while-compressing = 压缩时出错，请尝试取消选中某些复选框以减小配置文件大小。

## NetworkSettings
## This is used in the network chart.

NetworkSettings--panel-search =
    .label = 过滤网络请求：
    .title = 只显示匹配某些名称的网络请求

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

PanelSearch--search-field-hint = 您知道可以使用半角逗号（,）搜索多个词条吗？

## Profile Name Button

ProfileName--edit-profile-name-button =
    .title = 编辑分析记录名
ProfileName--edit-profile-name-input =
    .title = 编辑分析记录名
    .aria-label = 分析记录名

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = 删除
    .title = 点击此处删除 Profile { $smallProfileName }

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = 删除此分析文件时出错。<a>鼠标悬停此处了解更多信息。</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = 删除 { $profileName }
ProfileDeletePanel--dialog-confirmation-question = 您确定要删除此分析记录上传的数据吗？删除后，先前分享的链接将失效。
ProfileDeletePanel--dialog-cancel-button =
    .value = 取消
ProfileDeletePanel--dialog-delete-button =
    .value = 删除
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = 正在删除…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = 已成功删除上传的数据。

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = 完整范围（{ $fullRangeDuration }）

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-post-message = 正在导入并处理分析记录…
ProfileLoaderAnimation--loading-unpublished = 正在直接从 { -firefox-brand-name } 导入分析记录…
ProfileLoaderAnimation--loading-from-file = 正在读取文件并处理分析记录…
ProfileLoaderAnimation--loading-local = 尚未实现。
ProfileLoaderAnimation--loading-public = 正在下载处理分析记录…
ProfileLoaderAnimation--loading-from-url = 正在下载处理分析记录…
ProfileLoaderAnimation--loading-compare = 正在读取和处理分析记录…
ProfileLoaderAnimation--loading-view-not-found = 找不到视图

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = 返回主页

## Root

Root--error-boundary-message =
    .message = 啊哦，profiler.firefox.com 发生某些未知错误。

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = 正在应用…
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

StackSettings--implementation-all-frames = 所有帧
    .title = 不过滤栈上的帧
StackSettings--implementation-script = 脚本
    .title = 只显示与执行脚本相关的栈帧
StackSettings--implementation-native2 = 原生
    .title = 仅显示栈上的原生代码帧
# This label is displayed in the marker chart and marker table panels only.
StackSettings--stack-implementation-label = 过滤栈：
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
StackSettings--use-stack-chart-same-widths = 所有栈使用相同宽度显示
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

## TabSelectorMenu
## This component is a context menu that's opened when you click on the root
## range at the top left corner for profiler analysis view. It's used to switch
## between tabs that were captured in the profile.

TabSelectorMenu--all-tabs-and-windows = 所有标签页和窗口

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = 只显示此进程
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
TrackContextMenu--show-local-tracks-in-process = 显示此进程中的所有轨道
# This is used as the context menu item to hide all tracks of the selected track's type.
# Variables:
#   $type (String) - Name of the type of selected track to hide.
TrackContextMenu--hide-all-tracks-by-selected-track-type = 隐藏所有“{ $type }”类型的轨道
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = 显示所有匹配的轨道
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = 隐藏所有匹配的轨道
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = 找不到“<span>{ $searchFilter }</span>”的结果
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = 隐藏轨道
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = 隐藏进程

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track

TrackMemoryGraph--relative-memory-at-this-time = 此时的相对内存用量
TrackMemoryGraph--memory-range-in-graph = 图表里的内存范围
TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample = 自上次采样以来的分配和释放情况

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
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = 当前选择范围内的平均功耗
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = 当前选择范围内的平均功耗
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = 当前选择范围内的平均功耗
# This is used in the tooltip when the energy used in the current range uses the
# kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour = { $value } kWh（{ $carbonValue } kg CO₂e）
    .label = 可见范围内的能耗
# This is used in the tooltip when the energy used in the current range uses the
# watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-range-watthour = { $value } Wh（{ $carbonValue } g CO₂e）
    .label = 可见范围内的能耗
# This is used in the tooltip when the energy used in the current range uses the
# milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour = { $value } mWh ({ $carbonValue } mg CO2e)
    .label = 可见范围内的能耗
# This is used in the tooltip when the energy used in the current range uses the
# microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-range-microwatthour = { $value } µWh ({ $carbonValue } mg CO2e)
    .label = 可见范围内的能耗
# This is used in the tooltip when the energy used in the current preview
# selection uses the kilowatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (kilograms)
TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour = { $value } kWh（{ $carbonValue } kg CO₂e）
    .label = 当前选择范围内的能耗
# This is used in the tooltip when the energy used in the current preview
# selection uses the watt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (grams)
TrackPower--tooltip-energy-carbon-used-in-preview-watthour = { $value } Wh ({ $carbonValue } g CO2e)
    .label = 当前选择范围内的能耗
# This is used in the tooltip when the energy used in the current preview
# selection uses the milliwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour = { $value } mWh ({ $carbonValue } mg CO2e)
    .label = 当前选择范围内的能耗
# This is used in the tooltip when the energy used in the current preview
# selection uses the microwatt-hour unit.
# Variables:
#   $value (String) - the energy value for this range
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value (milligrams)
TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour = { $value } µWh ({ $carbonValue } mg CO2e)
    .label = 当前选择范围内的能耗

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
TrackBandwidthGraph--speed = { $value } 每秒
    .label = 此样本的传输速度
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = 上次采样结束后发生的读写操作数
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value }（{ $carbonValue } g CO₂e）
    .label = 目前为止传输的数据
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data during the visible time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-graph = { $value }（{ $carbonValue } g CO₂e）
    .label = 可见范围内传输的数据
# This is used in the tooltip of the bandwidth track when a range is selected.
# Variables:
#   $value (String) - the total of transfered data during the selected time range.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--total-bandwidth-in-range = { $value }（{ $carbonValue } g CO₂e）
    .label = 当前选中部分传输的数据

## TrackSearchField
## The component that is used for the search input in the track context menu.

TrackSearchField--search-input =
    .placeholder = 输入过滤条件
    .title = 只显示匹配特定文本的轨道

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
TransformNavigator--complete = 完整“{ $item }”
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
# "Focus category" transform. The word "Focus" has the meaning of an adjective here.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=focus-category
# Variables:
#   $item (String) - Name of the category that transform applied to.
TransformNavigator--focus-category = 聚焦分类：{ $item }
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
# "Collapse recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-recursion = 取消递归：{ $item }
# "Collapse direct recursion" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-direct-recursion-only = 仅取消直接递归：{ $item }
# "Collapse function subtree" transform.
# See: https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=collapse
# Variables:
#   $item (String) - Name of the function that transform applied to.
TransformNavigator--collapse-function-subtree = 折叠子树：{ $item }
# "Drop samples outside of markers matching ..." transform.
# Variables:
#   $item (String) - Search filter of the markers that transform will apply to.
TransformNavigator--drop-samples-outside-of-markers-matching = 丢弃与标记（匹配条件：“{ $item }”）不相关的样本

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
BottomBox--source-code-not-available-title = 源代码不可用
# Displayed whenever the source view was not able to get the source code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
SourceView--source-not-available-text = 关于支持的使用场景和改进计划，请参阅 <a>issue #3741</a>。
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = 汇编代码不可用
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Elements:
#   <a>link text</a> - A link to the github issue about supported scenarios.
BottomBox--assembly-code-not-available-text = 关于支持的使用场景和改进计划，请参阅 <a>issue #4520</a>。
SourceView--close-button =
    .title = 关闭源代码视图

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.

# Displayed below SourceView--cannot-obtain-source, if the profiler does not
# know which URL to request source code from.
SourceView--no-known-cors-url = 此文件没有已知的 cross-origin-accessible 网址。
# Displayed below SourceView--cannot-obtain-source, if there was a network error
# when fetching the source code for a file.
# Variables:
#   $url (String) - The URL which we tried to get the source code from
#   $networkErrorMessage (String) - The raw internal error message that was encountered by the network request, not localized
SourceView--network-error-when-obtaining-source = 获取网址 { $url } 时发生网络错误：{ $networkErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser could not
# be queried for source code using the symbolication API.
# Variables:
#   $browserConnectionErrorMessage (String) - The raw internal error message, not localized
SourceView--browser-connection-error-when-obtaining-source = 无法查询浏览器的符号化 API：{ $browserConnectionErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-error-when-obtaining-source = 浏览器的符号化 API 返回错误：{ $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned an error.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-error-when-obtaining-source = 本地符号服务器的符号化 API 返回错误：{ $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if the browser was queried
# for source code using the symbolication API, and this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--browser-api-malformed-response-when-obtaining-source = 浏览器的符号化 API 返回异常响应：{ $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a symbol server which is
# running locally was queried for source code using the symbolication API, and
# this query returned a malformed response.
# Variables:
#   $apiErrorMessage (String) - The raw internal error message from the API, not localized
SourceView--local-symbol-server-api-malformed-response-when-obtaining-source = 本地符号服务器的符号化 API 返回异常响应：{ $apiErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a file could not be found in
# an archive file (.tar.gz) which was downloaded from crates.io.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $pathInArchive (String) - The raw path of the member file which was not found in the archive.
SourceView--not-in-archive-error-when-obtaining-source = { $url } 处的存档中未找到文件 { $pathInArchive }。
# Displayed below SourceView--cannot-obtain-source, if the file format of an
# "archive" file was not recognized. The only supported archive formats at the
# moment are .tar and .tar.gz, because that's what crates.io uses for .crates files.
# Variables:
#   $url (String) - The URL from which the "archive" file was downloaded.
#   $parsingErrorMessage (String) - The raw internal error message during parsing, not localized
SourceView--archive-parsing-error-when-obtaining-source = 无法解析 { $url } 处的存档：{ $parsingErrorMessage }
# Displayed below SourceView--cannot-obtain-source, if a JS file could not be found in
# the browser.
# Variables:
#   $url (String) - The URL of the JS source file.
#   $sourceUuid (number) - The UUID of the JS source file.
#   $errorMessage (String) - The raw internal error message, not localized
SourceView--not-in-browser-error-when-obtaining-js-source = 浏览器无法获取位置为 { $url }、sourceUuid 为 { $sourceUuid } 的源代码文件：{ $errorMessage }。

## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = 显示汇编代码视图
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = 隐藏汇编代码视图

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = 已上传的分析记录
