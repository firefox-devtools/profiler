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

## CallNodeContextMenu
## This is used as a context menu for the Call Tree, Flame Graph and Stack Chart
## panels.

CallNodeContextMenu--transform-merge-function = Îmbină funcția
    .title =
        Îmbinarea unei funcții elimină funcția din profil și timpul ei este alocat
        funcției care a apelat-o. Se întâmplă oriunde funcția a fost apelată în
        arbore.
CallNodeContextMenu--transform-merge-call-node = Îmbină numai nodul
    .title =
        Îmbinarea unui nod îl elimină din profil și îi alocă timpul
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

## Tab Bar for the bottom half of the analysis UI.

TabBar--calltree-tab = Arbore de apelare
