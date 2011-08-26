function parse() {
  var parser = new Parser();
  var data = parser.parse(document.getElementById("data").value);
  data = parser.convertToCallTree(data);
  document.getElementById("result").textContent = data.toSource();
}
