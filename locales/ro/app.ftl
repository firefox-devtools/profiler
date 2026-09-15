# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### Localization for the App UI of Profiler


## The following feature names must be treated as a brand. They cannot be translated.

-firefox-brand-name = Firefox
-firefox-android-brand-name = Firefox pentru Android
-profiler-brand-name = Firefox Profiler
-profiler-brand-short-name = Profiler
-firefox-nightly-brand-name = Firefox Nightly

## AppHeader
## This is used at the top of the homepage and other content pages.

AppHeader--app-header = <header>{ -profiler-brand-name }</header> — <subheader>Aplicație web pentru analiza performanței { -firefox-brand-name }</subheader>
AppHeader--github-icon =
    .title = Mergi în depozitarul nostru Git (se deschide într-o fereastră nouă)

## ThemeToggle
## They are used at the top right side of the home page to switch between themes.

ThemeToggle--system =
    .title = Urmează preferințele de temă din sistem
ThemeToggle--light =
    .title = Folosește tema luminoasă
ThemeToggle--dark =
    .title = Folosește tema întunecată

## AppViewRouter
## This is used for displaying errors when loading the application.

AppViewRouter--error-from-post-message = Profilul nu a putut fi importat.
AppViewRouter--error-unpublished = Nu s-a putut recupera profilul de la { -firefox-brand-name }.
AppViewRouter--error-from-file = Fișierul nu poate fi citit sau nu se poate analiza profilul din el.
AppViewRouter--error-local = Nu este încă implementat.
AppViewRouter--error-public = Profilul nu poate fi descărcat.
AppViewRouter--error-from-url = Profilul nu poate fi descărcat.
AppViewRouter--error-compare = Profilele nu pot fi recuperate.
# This error message is displayed when a Safari-specific error state is encountered.
# Importing profiles from URLs such as http://127.0.0.1:someport/ is not possible in Safari.
# https://profiler.firefox.com/from-url/http%3A%2F%2F127.0.0.1%3A3000%2Fprofile.json/
AppViewRouter--error-from-localhost-url-safari =
    Din cauza unei <a>limitări specifice din Safari</a>, { -profiler-brand-name } nu poate
    importa profiluri din mașina locală în acest browser. Te rugăm să deschizi, 
    în schimb, pagina în { -firefox-brand-name } sau Chrome.
    .title = Safari nu poate importa profiluri locale
# This error message is displayed when the profile is in a newer format version
# than this build of the Profiler is able to read.
AppViewRouter--error-profile-version =
    Profilul folosește un format care nu are suport în această versiune { -profiler-brand-name }.
    Încearcă să reîmprospătezi pagina ca să vezi dacă nu cumva există o actualizare disponibilă pentru { -profiler-brand-name }.
AppViewRouter--route-not-found--home =
    .specialMessage = URL-ul pe care ai încercat să intri nu este recunoscut.

## Backtrace
## This is used to display a backtrace (call stack) for a marker or sample.

# Variables:
#   $function (String) - Name of the function that was inlined.
Backtrace--inlining-badge = (integrată)
    .title = { $function } a fost integrată în apelantul ei de către compilator.

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

# Variables:
#   $fileName (String) - Name of the file to open.
CallNodeContextMenu--show-file = Arată <strong>{ $fileName }</strong>
CallNodeContextMenu--transform-merge-function = Îmbină funcția
    .title =
        Îmbinarea unei funcții elimină funcția din profil și timpul ei este alocat
        funcției care a apelat-o. Se întâmplă oriunde funcția a fost apelată în
        arbore.
CallNodeContextMenu--transform-merge-call-node = Îmbină numai nodul
    .title =
        Îmbinarea unui nod elimină nodul din profil și timpul lui este alocat
        nodului funcției care l-a apelat. Elimină doar funcția din
        acea parte specifică a arborelui. Orice alte locuri din care a fost apelată funcția
        vor rămâne în profil.
# This is used as the context menu item title for "Focus on function" and "Focus
# on function (inverted)" transforms.
CallNodeContextMenu--transform-focus-function-title =
    Focalizarea pe o funcție va elimina orice eșantion care nu include funcția
    respectivă. În plus, reface rădăcina arborelui de apelare astfel încât funcția
    să fie singura rădăcină a arborelui. Poate combina mai multe situri de apelare a funcțiilor
    dintr-un profil într-un singur nod de apelare.
CallNodeContextMenu--transform-focus-function = Focalizare pe funcție
    .title = { CallNodeContextMenu--transform-focus-function-title }
CallNodeContextMenu--transform-focus-function-inverted = Focalizare pe funcție (inversată)
    .title = { CallNodeContextMenu--transform-focus-function-title }

## The translation for "self" in these strings should match the translation used
## in CallTree--samples-self and CallTree--bytes-self. Alternatively it can be
## translated as "self values" or "self time" (though "self time" is less desirable
## because this menu item is also shown in "bytes" mode).

CallNodeContextMenu--transform-focus-self-title =
    Focalizarea pe „proprii” este similară cu focalizarea pe o funcție, dar reține doar eșantioanele
    care contribuie la timpul propriu al funcției. Eșantioanele din funcțiile apelate
    sunt abandonate, iar arborele de apelare primește altă rădăcină, pe funcția focalizată.
CallNodeContextMenu--transform-focus-self = Focalizare numai pe proprii
    .title = { CallNodeContextMenu--transform-focus-self-title }

##

CallNodeContextMenu--transform-focus-subtree = Focalizare numai pe sub-arbore
    .title =
        Focalizarea pe un sub-arbore va elimina orice eșantion care nu include
        acea parte specifică a arborelui de apelare. Extrage o ramură a arborelui de apelare,
        dar o face numai pentru nodul de apelare individual respectiv. Toate celelalte apelări
        ale funcției sunt ignorate.
# This is used as the context menu item to apply the "Focus on category" transform.
# Variables:
#   $categoryName (String) - Name of the category to focus on.
CallNodeContextMenu--transform-focus-category = Focalizare pe categorie <strong>{ $categoryName }</strong>
    .title =
        Focalizarea pe noduri din aceeași categorie cu nodul selectat,
        îmbinând, prin urmare, toate nodurile care aparțin unei alte categorii.
CallNodeContextMenu--transform-collapse-function-subtree = Restrânge funcția
    .title =
        Restrângerea unei funcții va elimina orice a apelat și va aloca
        tot timpul funcției. Poate ajuta la simplificarea unui profil care
        apelează în cod ceva ce nu trebuie să fie analizat.
# This is used as the context menu item to apply the "Collapse resource" transform.
# Variables:
#   $nameForResource (String) - Name of the resource to collapse.
CallNodeContextMenu--transform-collapse-resource = Restrânge <strong>{ $nameForResource }</strong>
    .title =
        Restrângerea unei resurse va aplatiza toate apelurile către
        resursa respectivă într-un nod de apelare unic și restrâns.
CallNodeContextMenu--transform-collapse-recursion = Restrânge recursivitatea
    .title =
        Restrângerea recursivității elimină apelurile care apelează recursiv repetitiv
        aceeași funcție, chiar cu funcții intermediare în stivă.
CallNodeContextMenu--transform-collapse-direct-recursion-only = Restrânge numai recursivitatea directă
    .title =
        Restrângerea recursivității directe elimină apelurile care apelează recursiv repetitiv
        aceeași funcție fără funcții intermediare în stivă.
CallNodeContextMenu--transform-drop-function = Ignoră eșantioanele cu această funcție
    .title =
        Ignorarea eșantioanelor le elimină timpul din profil. Este util pentru
        eliminarea informațiilor de timp care nu sunt relevante pentru analiză.
CallNodeContextMenu--expand-all = Extinde tot
# Searchfox is a source code indexing tool for Mozilla Firefox.
# See: https://searchfox.org/
CallNodeContextMenu--searchfox = Caută denumirea funcției pe Searchfox
CallNodeContextMenu--copy-function-name = Copiază denumirea funcției
CallNodeContextMenu--copy-script-url = Copiază URL-ul scriptului
CallNodeContextMenu--copy-stack = Copiază stiva
CallNodeContextMenu--show-the-function-in-devtools = Arată funcția în DevTools

## CallTree
## This is the component for Call Tree panel.

CallTree--tracing-ms-total = Timp de execuție (ms)
    .title =
        Timpul „total” de execuție include un rezumat al tuturor timpilor în care
        funcția a fost observată ca fiind în stivă. Include timpul când
        funcția a rulat efectiv și timpul petrecut în apelanții din
        această funcție.
CallTree--tracing-ms-self = Proprii (ms)
    .title =
        Timpul „propriu” include numai timpul în care funcția era
        la sfârșitul stivei. Dacă funcția a apelat alte funcții,
        atunci timpul „celorlalte” funcții nu este inclus. Timpul „propriu” este util
        pentru înțelegerea modului în care a fost petrecut timpul într-un program.
CallTree--samples-total = Total (eșantioane)
    .title =
        Numărul „total” de eșantioane include un rezumat al fiecărui eșantion în care
        funcția a fost observată ca fiind în stivă. Include timpul în care
        funcția a rulat efectiv și timpul petrecut în apelanții din această
        funcție.
CallTree--samples-self = Propriu
    .title =
        Numărul de eșantioane „proprii” include numai eșantioanele în care funcția era
        la sfârșitul stivei. Dacă funcția a apelat alte funcții,
        atunci numărătorile „celorlalte” funcții nu sunt incluse. Numărătoarea „proprii” este utilă
        pentru înțelegerea modului în care a fost petrecut timpul într-un program.
CallTree--bytes-total = Mărime totală (octeți)
    .title =
        „Mărimea totală” include un rezumat al tuturor octeților alocați sau
        dealocați în timp ce funcția a fost observată ca fiind în stivă.
        Include atât octeți când funcția rula efectiv, cât și
        octeți ai apelanților de la această funcție.
CallTree--bytes-self = Proprii (octeți)
    .title =
        Octeții „proprii” includ octeții alocați sau dealocați când
        funcția era la sfârșitul stivei. Dacă funcția a apelat
        alte funcții, atunci octeții „celorlalte” funcții nu sunt incluși.
        Octeții „proprii” sunt utili pentru înțelegerea modului în care a fost de fapt
        alocată și dealocată memoria în program.

## Call tree "badges" (icons) with tooltips
##
## These inlining badges are displayed in the call tree in front of some
## functions for native code (C / C++ / Rust). They're a small "inl" icon with
## a tooltip.

# Variables:
#   $calledFunction (String) - Name of the function whose call was sometimes inlined.
CallTree--divergent-inlining-badge =
    .title = Unele apeluri către { $calledFunction } ai fost încorporate de compilator.
# Variables:
#   $calledFunction (String) - Name of the function whose call was inlined.
#   $outerFunction (String) - Name of the outer function into which the called function was inlined.
CallTree--inlining-badge = (încorporate)
    .title = Apelurile către { $calledFunction } au fost încorporate în { $outerFunction } de către compilator.

## CallTreeSidebar
## This is the sidebar component that is used in Call Tree and Flame Graph panels.

CallTreeSidebar--select-a-node = Selectează un nod pentru afișarea informațiilor despre el.
CallTreeSidebar--call-node-details = Detalii nod de apelare

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
    .label = Timp de execuție urmărit
CallTreeSidebar--traced-self-time =
    .label = Timp propriu urmărit
CallTreeSidebar--running-time =
    .label = Timp de execuție
CallTreeSidebar--self-time =
    .label = Timp propriu
CallTreeSidebar--running-samples =
    .label = Eșantioane de execuție
CallTreeSidebar--self-samples =
    .label = Eșantioane proprii
CallTreeSidebar--running-size =
    .label = Mărime de execuție
CallTreeSidebar--self-size =
    .label = Mărime proprie
CallTreeSidebar--categories = Categorii
CallTreeSidebar--implementation = Implementare
CallTreeSidebar--running-milliseconds = Milisecunde de execuție
CallTreeSidebar--running-sample-count = Număr eșantioane de execuție
CallTreeSidebar--running-bytes = Octeți de execuție
CallTreeSidebar--self-milliseconds = Milisecunde proprii
CallTreeSidebar--self-sample-count = Număr eșantioane proprii
CallTreeSidebar--self-bytes = Octeți proprii

## CompareHome
## This is used in the page to compare two profiles.
## See: https://profiler.firefox.com/compare/

CompareHome--instruction-title = Introdu URL-urile profilurilor pe care vrei să le compari
CompareHome--instruction-content =
    Instrumentul va extrage datele din pista și intervalul selectate pentru 
    fiecare profil și le va pune în același ecran de vizualizare pentru ușurință la 
    comparare.
CompareHome--form-label-profile1 = Profilul 1:
CompareHome--form-label-profile2 = Profilul 2:
CompareHome--submit-button =
    .value = Recuperează profilurile

## ListOfPublishedProfiles
## This is the component that displays all the profiles the user has uploaded.
## It's displayed both in the homepage and in the uploaded recordings page.

ListOfPublishedProfiles--uploaded-profile-information-list-empty = Nu a fost încărcat niciun profil încă!
# This string is used below the 'Your recent uploaded recordings' list section.
# Variables:
#   $profilesRestCount (Number) - Remaining numbers of the uploaded profiles which are not listed under 'Your recent uploaded recordings'.
ListOfPublishedProfiles--uploaded-profile-information-label = Vezi și gestionezi toate înregistrările (încă { $profilesRestCount })
# Depending on the number of uploaded profiles, the message is different.
# Variables:
#   $uploadedProfileCount (Number) - Total numbers of the uploaded profiles.
ListOfPublishedProfiles--uploaded-profile-information-list =
    { $uploadedProfileCount ->
        [one] Gestionează înregistrarea
       *[other] Gestionează înregistrările
    }

## MarkerContextMenu
## This is used as a context menu for the Marker Chart, Marker Table and Network
## panels.

MarkerContextMenu--set-selection-from-duration = Setează selecția de la durata marcajului
MarkerContextMenu--start-selection-here = Începe selecția de aici
MarkerContextMenu--end-selection-here = Termină selecția aici
MarkerContextMenu--start-selection-at-marker-start = Începe selecția la <strong>începutul</strong> marcajului
MarkerContextMenu--start-selection-at-marker-end = Începe selecția la <strong>sfârșitul</strong> marcajului
MarkerContextMenu--end-selection-at-marker-start = Termină selecția la <strong>începutul</strong> marcajului
MarkerContextMenu--end-selection-at-marker-end = Termină selecția la <strong>sfârșitul</strong> marcajului
MarkerContextMenu--copy-description = Copiază descrierea
MarkerContextMenu--copy-call-stack = Copiază stiva de apeluri
MarkerContextMenu--copy-url = Copiază URL-ul
MarkerContextMenu--copy-page-url = Copiază URL-ul paginii
MarkerContextMenu--copy-as-json = Copiază ca JSON
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-receiver-thread = Selectează firul destinatarului „<strong>{ $threadName }</strong>”
# This string is used on the marker context menu item when right clicked on an
# IPC marker.
# Variables:
#   $threadName (String) - Name of the thread that will be selected.
MarkerContextMenu--select-the-sender-thread = Selectează firul expeditorului „<strong>{ $threadName }</strong>”

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Arbore de apelare
