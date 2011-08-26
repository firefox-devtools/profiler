function parse() {
  var parser = new Parser();
  var data = parser.parse(document.getElementById("data").value);
  document.getElementById("result").textContent = data.toSource();
}
