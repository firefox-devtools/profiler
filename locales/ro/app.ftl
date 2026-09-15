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

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Arbore de apelare
