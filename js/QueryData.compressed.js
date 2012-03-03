/*

QueryData.js

A function to parse data from a query string

Created by Stephen Morley - http://code.stephenmorley.org/ - and released under
the terms of the CC0 1.0 Universal legal code:

http://creativecommons.org/publicdomain/zero/1.0/legalcode

*/

function QueryData(_1,_2){
if(_1==undefined){
_1=location.search?location.search:"";
}
if(_1.charAt(0)=="?"){
_1=_1.substring(1);
}
if(_1.length>0){
_1=_1.replace(/\+/g," ");
var _3=_1.split(/[&;]/g);
for(var _4=0;_4<_3.length;_4++){
var _5=_3[_4].split("=");
var _6=decodeURIComponent(_5[0]);
var _7=_5.length>1?decodeURIComponent(_5[1]):"";
if(_2){
if(!(_6 in this)){
this[_6]=[];
}
this[_6].push(_7);
}else{
this[_6]=_7;
}
}
}
};
