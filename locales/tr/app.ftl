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
-firefox-android-brand-name = Android için Firefox
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--github-icon =
    .title = Git depomuza gidin (yeni pencerede açılır)

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-unpublished = { -firefox-brand-name } tarayıcısından profil alınamadı.
AppViewRouter--error-from-file = Dosya okunamadı veya içindeki profil ayrıştırılamadı.
AppViewRouter--error-local = Henüz hazır değil.
AppViewRouter--error-public = Profil indirilemedi.
AppViewRouter--error-from-url = Profil indirilemedi.
AppViewRouter--error-compare = Profiller getirilemedi.
AppViewRouter--route-not-found--home =
    .specialMessage = Ulaşmaya çalıştığınız URL tanınamadı.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = <strong>{ $fileName }</strong> dosyasını göster
CallNodeContextMenu--expand-all = Tümünü genişlet
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Fonksiyon adını Searchfox’ta ara
CallNodeContextMenu--copy-function-name = Fonksiyon adını kopyala
CallNodeContextMenu--copy-script-url = Betik URL'sini kopyala
CallNodeContextMenu--copy-stack = Yığını kopyala

## CallTree
## This is the component for Call Tree panel.


## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Bazı { $calledFunction } çağrıları derleyici tarafından satır içine dönüştürüldü.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Hakkındaki bilgileri görüntülemek için bir düğüm seçin.

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

CallTreeSidebar--running-time =
    .label = Çalışma süresi
CallTreeSidebar--categories = Kategoriler

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Karşılaştırmak istediğiniz profil URL’lerini girin
CompareHome--form-label-profile1 = Profil 1:
CompareHome--form-label-profile2 = Profil 2:
CompareHome--submit-button =
    .value = Profilleri getir

## DebugWarning
## This is displayed at the top of the analysis page when the loaded profile is
## a debug build of Firefox.


## Details
## This is the bottom panel in the analysis UI. They are generic strings to be
## used at the bottom part of the UI.

Details--open-sidebar-button =
    .title = Kenar çubuğunu aç
Details--close-sidebar-button =
    .title = Kenar çubuğunu kapat
Details--error-boundary-message =
    .message = Bu panelde bilinmeyen bir hata oluştu.

## ErrorBoundary
## This component is shown when an unexpected error is encountered in the application.
## Note that the localization won't be always applied in this component.

# This message will always be displayed after another context-specific message.
ErrorBoundary--report-error-to-developers-description =
    Lütfen bu sorunu Geliştirici Araçları Web Konsolu’nda görüntülenen
    hatanın tamamıyla birlikte geliştiricilere bildirin.
# This is used in a call to action button, displayed inside the error box.
ErrorBoundary--report-error-on-github = Hatayı GitHub’da rapor et

## Footer Links

FooterLinks--legal = Hukuki bilgiler
FooterLinks--Privacy = Gizlilik
FooterLinks--Cookies = Çerezler
FooterLinks--languageSwitcher--select =
    .title = Dili değiştir
FooterLinks--hide-button =
    .title = Alt bilgi bağlantılarını gizle
    .aria-label = Alt bilgi bağlantılarını gizle

## FullTimeline
## The timeline component of the full view in the analysis UI at the top of the
## page.

# This string is used as the text of the track selection button.
# Displays the ratio of visible tracks count to total tracks count in the timeline.
# We have spans here to make the numbers bold.
# Variables:
#   $visibleTrackCount (Number) - Visible track count in the timeline
#   $totalTrackCount (Number) - Total track count in the timeline
FullTimeline--tracks-button = <span>{ $visibleTrackCount }</span> / <span>{ $totalTrackCount }</span> yol

## Home page

Home--upload-from-file-input-button = Dosyadan profil yükle
Home--upload-from-url-button = URL’den profil yükle
Home--load-from-url-submit-button =
    .value = Yükle
Home--documentation-button = Dokümantasyon
Home--menu-button = { -profiler-brand-name } menü düğmesini etkinleştir
# The word WebChannel should not be translated.
# This message can be seen on https://main--perf-html.netlify.app/ in the tooltip
# of the "Enable Firefox Profiler menu button" button.
Home--enable-button-unavailable =
    .title = Bu profilleyici örneği WebChannel’a bağlanamadığı için profilleyici menü düğmesini etkinleştiremez.
Home--record-instructions-start-stop = Profillemeyi durdur ve başlat
Home--record-instructions-capture-load = Profili yakala ve yükle
Home--profiler-motto = Performans profili yakalayın. Analiz edin. Paylaşın. Web’i daha hızlı hale getirin.
Home--additional-content-title = Mevcut profilleri yükleyin
Home--additional-content-content = Bir profil dosyasını yüklemek için buraya <strong>sürükleyip bırakabilirsiniz</strong> ya da:
Home--compare-recordings-info = Ayrıca kayıtları karşılaştırabilirsiniz. <a>Karşılaştırma arayüzünü aç.</a>
Home--your-recent-uploaded-recordings-title = Son yüklediğiniz kayıtlar

## IdleSearchField
## The component that is used for all the search inputs in the application.

IdleSearchField--search-input =
    .placeholder = Filtre terimlerini girin

## JsTracerSettings
## JSTracer is an experimental feature and it's currently disabled. See Bug 1565788.


## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

# This string is used on the tooltip of the published profile links.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ListOfPublishedProfiles--published-profiles-link =
    .title = { $smallProfileName } profilini yüklemek için buraya tıklayın
ListOfPublishedProfiles--published-profiles-delete-button-disabled = Sil
    .title = Yetkilendirme bilgileri eksik olduğu için bu profil silinemez.

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.


## MarkerFiltersContextMenu
## This is the menu when filter icon is clicked in Marker Chart and Marker Table
## panels.


## MarkerSettings
## This is used in all panels related to markers.


## MarkerSidebar
## This is the sidebar component that is used in Marker Table panel.


## MarkerTable
## This is the component for Marker Table panel.


## MenuButtons
## These strings are used for the buttons at the top of the profile viewer.

MenuButtons--index--metaInfo-button =
    .label = Profil Bilgileri
MenuButtons--index--full-view = Tam Görünüm
MenuButtons--index--cancel-upload = Yüklemeyi İptal Et
MenuButtons--index--share-upload =
    .label = Yerel Profili Yükle
MenuButtons--index--share-re-upload =
    .label = Yeniden Yükle
MenuButtons--index--share-error-uploading =
    .label = Yükleme başarısız
MenuButtons--index--revert = Orijinal profile geri dön
MenuButtons--index--docs = Dokümanlar
MenuButtons--permalink--button =
    .label = Kalıcı bağlantı

## MetaInfo panel
## These strings are used in the panel containing the meta information about
## the current profile.

MenuButtons--index--profile-info-uploaded-label = Yüklenme tarihi:
MenuButtons--index--profile-info-uploaded-actions = Sil
MenuButtons--index--metaInfo-subtitle = Profil Bilgileri
MenuButtons--metaInfo--symbols = Semboller:
MenuButtons--metaInfo--cpu-model = İşlemci modeli:
MenuButtons--metaInfo--cpu-cores = İşlemci çekirdekleri:
MenuButtons--metaInfo--main-memory = Ana bellek:
MenuButtons--index--show-moreInfo-button = Daha fazla göster
MenuButtons--index--hide-moreInfo-button = Daha az göster
# This string is used when we have the information about both physical and
# logical CPU cores.
# Variable:
#   $physicalCPUs (Number), $logicalCPUs (Number) - Number of Physical and Logical CPU Cores
MenuButtons--metaInfo--physical-and-logical-cpu =
    { $physicalCPUs ->
        [one]
            { $logicalCPUs ->
                [one] { $physicalCPUs } fiziksel çekirdek, { $logicalCPUs } mantıksal çekirdek
               *[other] { $physicalCPUs } fiziksel çekirdek, { $logicalCPUs } mantıksal çekirdek
            }
       *[other]
            { $logicalCPUs ->
                [one] { $physicalCPUs } fiziksel çekirdek, { $logicalCPUs } mantıksal çekirdek
               *[other] { $physicalCPUs } fiziksel çekirdek, { $logicalCPUs } mantıksal çekirdek
            }
    }
# This string is used when we only have the information about the number of
# physical CPU cores.
# Variable:
#   $physicalCPUs (Number) - Number of Physical CPU Cores
MenuButtons--metaInfo--physical-cpu =
    { $physicalCPUs ->
        [one] { $physicalCPUs } fiziksel çekirdek
       *[other] { $physicalCPUs } fiziksel çekirdek
    }
# This string is used when we only have the information only the number of
# logical CPU cores.
# Variable:
#   $logicalCPUs (Number) - Number of logical CPU Cores
MenuButtons--metaInfo--logical-cpu =
    { $logicalCPUs ->
        [one] { $logicalCPUs } mantıksal çekirdek
       *[other] { $logicalCPUs } mantıksal çekirdek
    }
MenuButtons--metaInfo--profiling-started = Kayıt başlama tarihi:
MenuButtons--metaInfo--profiling-session = Kayıt uzunluğu:
MenuButtons--metaInfo--main-process-started = Ana işlemin başlama tarihi:
MenuButtons--metaInfo--main-process-ended = Ana işlemin bitiş tarihi:
MenuButtons--metaInfo--interval = Aralık:
MenuButtons--metaInfo--buffer-capacity = Tampon kapasitesi:
MenuButtons--metaInfo--buffer-duration = Tampon süresi:
# Buffer Duration in Seconds in Meta Info Panel
# Variable:
#   $configurationDuration (Number) - Configuration Duration in Seconds
MenuButtons--metaInfo--buffer-duration-seconds =
    { $configurationDuration ->
        [one] { $configurationDuration } saniye
       *[other] { $configurationDuration } saniye
    }
# Adjective refers to the buffer duration
MenuButtons--metaInfo--buffer-duration-unlimited = Sınırsız
MenuButtons--metaInfo--application = Uygulama
MenuButtons--metaInfo--name-and-version = Ad ve sürüm:
MenuButtons--metaInfo--application-uptime = Çalışma süresi:
MenuButtons--metaInfo--update-channel = Güncelleme kanalı:
MenuButtons--metaInfo--build-id = Yapı kimliği:
MenuButtons--metaInfo--build-type = Yapı tipi:
MenuButtons--metaInfo--arguments = Argümanlar:

## Strings refer to specific types of builds, and should be kept in English.

MenuButtons--metaInfo--build-type-debug = Hata ayıklama

##

MenuButtons--metaInfo--platform = Platform
MenuButtons--metaInfo--device = Cihaz:
# OS means Operating System. This describes the platform a profile was captured on.
MenuButtons--metaInfo--os = İşletim sistemi:
# ABI means Application Binary Interface. This describes the platform a profile was captured on.
MenuButtons--metaInfo--abi = ABI:
MenuButtons--metaInfo--visual-metrics = Görsel metrikler
MenuButtons--metaInfo-renderRowOfList-label-features = Özellikler:
MenuButtons--metaInfo-renderRowOfList-label-threads-filter = İş parçacıkları filtresi:
MenuButtons--metaInfo-renderRowOfList-label-extensions = Uzantılar:

## Overhead refers to the additional resources used to run the profiler.
## These strings are displayed at the bottom of the "Profile Info" panel.

MenuButtons--metaOverheadStatistics-subtitle = { -profiler-brand-short-name } yükü
MenuButtons--metaOverheadStatistics-mean = Ortalama
MenuButtons--metaOverheadStatistics-max = Maksimum
MenuButtons--metaOverheadStatistics-min = Minimum
MenuButtons--metaOverheadStatistics-overhead-duration = Ek yük süreleri:
MenuButtons--metaOverheadStatistics-overhead-percentage = Ek yük yüzdesi:

## Publish panel
## These strings are used in the publishing panel.

MenuButtons--publish--renderCheckbox-label-hidden-threads = Gizli iş parçaçıklarını dahil et
MenuButtons--publish--renderCheckbox-label-include-other-tabs = Diğer sekmelerdeki verileri dahil et
MenuButtons--publish--renderCheckbox-label-hidden-time = Gizli zaman aralığını dahil et
MenuButtons--publish--renderCheckbox-label-include-screenshots = Ekran görüntülerini dahil et
MenuButtons--publish--renderCheckbox-label-resource = Kaynak URL’lerini ve yollarını dahil et
MenuButtons--publish--renderCheckbox-label-extension = Uzantı bilgilerini dahil et
MenuButtons--publish--renderCheckbox-label-preference = Tercih değerlerini dahil et
MenuButtons--publish--renderCheckbox-label-private-browsing = Gizli gezinti pencerelerindeki verileri dahil et
MenuButtons--publish--renderCheckbox-label-private-browsing-warning-image =
    .title = Bu profil gizli gezinti verileri içeriyor
MenuButtons--publish--reupload-performance-profile = Performans Profilini Yeniden Yükle
MenuButtons--publish--share-performance-profile = Performans Profilini Paylaş
MenuButtons--publish--info-description = Profilinizi yükleyerek bağlantıya sahip herkesin erişmesini sağlayın.
MenuButtons--publish--button-upload = Yükle
MenuButtons--publish--upload-title = Profil yükleniyor…
MenuButtons--publish--cancel-upload = Yüklemeyi iptal et
MenuButtons--publish--message-something-went-wrong = Profil yüklenirken bir hata oluştu.
MenuButtons--publish--message-try-again = Yeniden dene
MenuButtons--publish--download = İndir
MenuButtons--publish--compressing = Sıkıştırılıyor…

## NetworkSettings
## This is used in the network chart.


## Timestamp formatting primitive


## PanelSearch
## The component that is used for all the search input hints in the application.

PanelSearch--search-field-hint = Birden fazla terim kullanarak arama yapmak için virgül (,) kullanabileceğinizi biliyor muydunuz?

## Profile Delete Button

# This string is used on the tooltip of the published profile links delete button in uploaded recordings page.
# Variables:
#   $smallProfileName (String) - Shortened name for the published Profile.
ProfileDeleteButton--delete-button =
    .label = Sil
    .title = { $smallProfileName } profilini silmek için buraya tıkla

## Profile Delete Panel
## This panel is displayed when the user clicks on the Profile Delete Button,
## it's a confirmation dialog.

# This string is used when there's an error while deleting a profile. The link
# will show the error message when hovering.
ProfileDeletePanel--delete-error = Bu profil silinirken bir hata oluştu. <a>Daha fazla bilgi için üstüne gelin.</a>
# This is the title of the dialog
# Variables:
#   $profileName (string) - Some string that identifies the profile
ProfileDeletePanel--dialog-title = { $profileName } profilini sil
ProfileDeletePanel--dialog-confirmation-question =
    Bu profil için yüklenen verileri silmek istediğinizden emin misiniz?
    Daha önce paylaşılan bağlantılar artık çalışmayacaktır.
ProfileDeletePanel--dialog-cancel-button =
    .value = Vazgeç
ProfileDeletePanel--dialog-delete-button =
    .value = Sil
# This is used inside the Delete button after the user has clicked it, as a cheap
# progress indicator.
ProfileDeletePanel--dialog-deleting-button =
    .value = Siliniyor…
# This message is displayed when a profile has been successfully deleted.
ProfileDeletePanel--message-success = Yüklenen veriler başarıyla silindi.

## ProfileFilterNavigator
## This is used at the top of the profile analysis UI.

# This string is used on the top left side of the profile analysis UI as the
# "Full Range" button. In the profiler UI, it's possible to zoom in to a time
# range. This button reverts it back to the full range. It also includes the
# duration of the full range.
# Variables:
#   $fullRangeDuration (String) - The duration of the full profile data.
ProfileFilterNavigator--full-range-with-duration = Tam aralık ({ $fullRangeDuration })

## Profile Loader Animation

ProfileLoaderAnimation--loading-from-file = Dosya okunuyor ve profil işleniyor…
ProfileLoaderAnimation--loading-local = Henüz hazır değil.
ProfileLoaderAnimation--loading-public = Profil indiriliyor ve işleniyor…
ProfileLoaderAnimation--loading-from-url = Profil indiriliyor ve işleniyor…
ProfileLoaderAnimation--loading-compare = Profiller okunuyor ve işleniyor…
ProfileLoaderAnimation--loading-view-not-found = Görünüm bulunamadı

## ProfileRootMessage

ProfileRootMessage--title = { -profiler-brand-name }
ProfileRootMessage--additional = Ana sayfaya dön

## Root

Root--error-boundary-message =
    .message = profiler.firefox.com adresinde bilinmeyen bir hata oluştu.

## ServiceWorkerManager
## This is the component responsible for handling the service worker installation
## and update. It appears at the top of the UI.

ServiceWorkerManager--applying-button = Uygulanıyor…
ServiceWorkerManager--pending-button = Uygula ve yeniden yükle
ServiceWorkerManager--installed-button = Uygulamayı yeniden yükle
ServiceWorkerManager--new-version-is-ready = Uygulamanın yeni sürümü indirildi ve kullanıma hazır.
ServiceWorkerManager--hide-notice-button =
    .title = Yeniden yükleme bildirimini gizle
    .aria-label = Yeniden yükleme bildirimini gizle

## StackSettings
## This is the settings component that is used in Call Tree, Flame Graph and Stack
## Chart panels. It's used to switch between different views of the stack.

StackSettings--implementation-all-frames = Tüm çerçeveler
    .title = Yığın çerçevelerini filtreleme
StackSettings--implementation-javascript2 = JavaScript
    .title = Yalnızca JavaScript yürütmesiyle ilgili yığın çerçevelerini göster
StackSettings--use-data-source-label = Veri kaynağı:
StackSettings--show-user-timing = Kullanıcı zamanlamasını göster

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Çağrı Ağacı
TabBar--flame-graph-tab = Alev Grafiği
TabBar--stack-chart-tab = Yığın Grafiği
TabBar--marker-chart-tab = İşaret Grafiği
TabBar--marker-table-tab = İşaret Tablosu
TabBar--network-tab = Ağ
TabBar--js-tracer-tab = JS İzleyici

## TrackContextMenu
## This is used as a context menu for timeline to organize the tracks in the
## analysis UI.

TrackContextMenu--only-show-this-process = Yalnızca bu işlemi göster
# This is used as the context menu item to show only the given track.
# Variables:
#   $trackName (String) - Name of the selected track to isolate.
TrackContextMenu--only-show-track = Yalnızca “{ $trackName }” yolunu göster
TrackContextMenu--hide-other-screenshots-tracks = Diğer ekran görüntüsü yollarını gizle
# This is used as the context menu item to hide the given track.
# Variables:
#   $trackName (String) - Name of the selected track to hide.
TrackContextMenu--hide-track = “{ $trackName }” yolunu gizle
TrackContextMenu--show-all-tracks = Tüm yolları göster
TrackContextMenu--show-local-tracks-in-process = Bu işlemdeki tüm yolları göster
# This is used in the tracks context menu as a button to show all the tracks
# that match the search filter.
TrackContextMenu--show-all-matching-tracks = Eşleşen tüm yolları göster
# This is used in the tracks context menu as a button to hide all the tracks
# that match the search filter.
TrackContextMenu--hide-all-matching-tracks = Eşleşen tüm yolları gizle
# This is used in the tracks context menu when the search filter doesn't match
# any track.
# Variables:
#   $searchFilter (String) - The search filter string that user enters.
TrackContextMenu--no-results-found = “<span>{ $searchFilter }</span>” için sonuç bulunamadı
# This button appears when hovering a track name and is displayed as an X icon.
TrackNameButton--hide-track =
    .title = Yolu gizle
# This button appears when hovering a global track name and is displayed as an X icon.
TrackNameButton--hide-process =
    .title = İşlemi gizle

## TrackMemoryGraph
## This is used to show the memory graph of that process in the timeline part of
## the UI. To learn more about it, visit:
## https://profiler.firefox.com/docs/#/./memory-allocations?id=memory-track


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
    .label = Güç
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-watt = { $value } W
    .label = Güç
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-power-milliwatt = { $value } mW
    .label = Güç
# This is used in the tooltip when the power value uses the kilowatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-kilowatt = { $value } kW
    .label = Geçerli seçimdeki ortalama güç
# This is used in the tooltip when the power value uses the watt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-watt = { $value } W
    .label = Geçerli seçimdeki ortalama güç
# This is used in the tooltip when the instant power value uses the milliwatt unit.
# Variables:
#   $value (String) - the power value at this location
TrackPower--tooltip-average-power-milliwatt = { $value } mW
    .label = Geçerli seçimdeki ortalama güç

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
TrackBandwidthGraph--speed = Saniyede { $value }
    .label = Bu örnek için aktarım hızı
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - how many read or write operations were performed since the previous sample
TrackBandwidthGraph--read-write-operations-since-the-previous-sample = { $value }
    .label = önceki örnekten bu yana okuma/yazma işlemleri
# This is used in the tooltip of the bandwidth track.
# Variables:
#   $value (String) - the total of transfered data until the hovered time.
#                     Will contain the unit (eg. B, KB, MB)
#   $carbonValue (string) - the carbon dioxide equivalent (CO₂e) value in grams
TrackBandwidthGraph--cumulative-bandwidth-at-this-time = { $value } ({ $carbonValue } g CO₂e)
    .label = Bu zamana kadar aktarılan veriler

## TrackSearchField
## The component that is used for the search input in the track context menu.


## TransformNavigator
## Navigator for the applied transforms in the Call Tree, Flame Graph, and Stack
## Chart components.
## These messages are displayed above the table / graph once the user selects to
## apply a specific transformation function to a node in the call tree. It's the
## name of the function, followed by the node's name.
## To learn more about them, visit:
## https://profiler.firefox.com/docs/#/./guide-filtering-call-trees?id=transforms


## "Bottom box" - a view which contains the source view and the assembly view,
## at the bottom of the profiler UI
##
## Some of these string IDs still start with SourceView, even though the strings
## are used for both the source view and the assembly view.

# Displayed while a view in the bottom box is waiting for code to load from
# the network.
# Variables:
#   $host (String) - The "host" part of the URL, e.g. hg.mozilla.org
SourceView--loading-url = { $host } bekleniyor…
# Displayed while a view in the bottom box is waiting for code to load from
# the browser.
SourceView--loading-browser-connection = { -firefox-brand-name } bekleniyor…
# Displayed whenever the source view was not able to get the source code for
# a file.
BottomBox--source-code-not-available-title = Kaynak kodu mevcut değil
# Displayed whenever the assembly view was not able to get the assembly code for
# a file.
# Assembly refers to the low-level programming language.
BottomBox--assembly-code-not-available-title = Assembly kodu mevcut değil
SourceView--close-button =
    .title = Kaynak görünümünü kapat

## Code loading errors
## These are displayed both in the source view and in the assembly view.
## The string IDs here currently all start with SourceView for historical reasons.


## Toggle buttons in the top right corner of the bottom box

# The toggle button for the assembly view, while the assembly view is hidden.
# Assembly refers to the low-level programming language.
AssemblyView--show-button =
    .title = Assembly görünümünü göster
# The toggle button for the assembly view, while the assembly view is shown.
# Assembly refers to the low-level programming language.
AssemblyView--hide-button =
    .title = Assembly görünümünü gizle

## UploadedRecordingsHome
## This is the page that displays all the profiles that user has uploaded.
## See: https://profiler.firefox.com/uploaded-recordings/

UploadedRecordingsHome--title = Yüklenen Kayıtlar
