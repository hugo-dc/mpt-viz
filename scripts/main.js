// import dependencies
var Trie = SecureTrie
var ethUtil = ethereumjsUtil
var Account = ethereumjsAccount
var BN = ethUtil.BN
var SafeBuffer = safeBuffer
var Buffer = safeBuffer.Buffer

const EMPTY_CODE_HASH = 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
const EMPTY_TRIE_ROOT = "56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"

// helper functions
function nibblesToBuffer(arr) {
  cout('>> nibblesToBuffer arr: ', arr)
  //cout(arr)
  var buf = new Buffer(arr.length / 2)
  for (var i = 0; i < buf.length; i++) {
    var q = i * 2
    buf[i] = (arr[q] << 4) + arr[++q]
  }
  return buf
}

function buf2hex(buffer) { // buffer is an ArrayBuffer
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

function format (a, toZero, isHex) {
  if (a === '') {
    return Buffer.alloc(0)
  }

  if (a.slice && a.slice(0, 2) === '0x') {
    a = a.slice(2)
    if (a.length % 2) a = '0' + a
    a = Buffer.from(a, 'hex')
  } else if (!isHex) {
    a = Buffer.from(new BN(a).toArray())
  } else {
    if (a.length % 2) a = '0' + a
    a = Buffer.from(a, 'hex')
  }

  if (toZero && a.toString('hex') === '') {
    a = Buffer.from([0])
  }

  return a
}

function addressPreimages(preState) {
  cout('>> addressPreimages')
  const addresses = Object.keys(preState)
  let preimages = {}
  for (let addy of addresses) {
    let hashedAddy = ethUtil.sha3(Buffer.from(ethUtil.stripHexPrefix(addy), 'hex')).toString('hex')
    preimages[hashedAddy] = addy
  }
  return preimages
}

function storagePreimages(storage) {
  cout('>> storagePreimages')
  const storageKeys = Object.keys(storage)
  let preimages = {}
  for (let key of storageKeys) {
    let paddedKey = ethUtil.setLength(Buffer.from(key.slice(2), 'hex'), 32)
    let hashedKey = ethUtil.sha3(paddedKey).toString('hex')
    preimages[hashedKey] = key
  }
  return preimages
}


/**
 * setupPreConditions given JSON testData
 * @param {[type]}   state    - the state DB/trie
 * @param {[type]}   testData - JSON from tests repo
 * @param {Function} done     - callback when function is completed
 */
function setupPreConditions (state, storageTrie, preState, done) {
  cout('>> setupPreConditions')
  var keysOfPre = Object.keys(preState)
  cout('keysOfPre: \n' + JSON.stringify(keysOfPre, undefined, 2))

  async.eachSeries(keysOfPre, function (key, callback) {
    var acctData = preState[key]
    var account = new Account()

    cout('acctData: ', acctData)

    account.nonce = format(acctData.nonce)
    account.balance = format(acctData.balance)

    var codeBuf = Buffer.from(acctData.code.slice(2), 'hex')
    storageTrie.root = null
    async.series([
      function (cb2) {
        var keys = Object.keys(acctData.storage)
        cout('NUMBER OF STORAGE KEYS:' + keys.length)
        let key_i = 0
        async.forEachSeries(keys, function (key, cb3) {
          cout('KEY_I:' + key_i)
          key_i = key_i + 1
          let val = acctData.storage[key]
          cout('storage foreach key:' + key)
          cout('val:' + val)
          // storage keys and vals passed with 0x and not RLP encoded
          key = ethUtil.setLength(Buffer.from(key.slice(2), 'hex'), 32)
          // not rlp encoded and with 0x
          val = rlp.encode(Buffer.from(val.slice(2), 'hex'))
          storageTrie.put(key, val, cb3)
        }, cb2)
      },
      function (cb2) {
        account.setCode(state, codeBuf, cb2)
      },
      function (cb2) {
        account.stateRoot = storageTrie.root

        cout('>>>> saving into state:')
        cout('[' + key.toString('hex') + ']:\n ' + account.serialize().toString('hex'))
        state.put(Buffer.from(ethUtil.stripHexPrefix(key), 'hex'), account.serialize(), function () {
          cb2()
        })
      }
    ], callback)
  }, done)
}


function initStateTree (testData) {
  cout('>> initStateTree')
  return new Promise((resolve, reject) => {
    const stateTrie = new Trie()
    const storageTrie = new Trie()

    setupPreConditions(stateTrie, storageTrie, testData, done)

    function done() {
      resolve(stateTrie)
    }
 
  })
}

function initStorageTree (testData) {
  cout('>> initStorageTree')
  return new Promise((resolve, reject) => {
    const stateTrie = new Trie()
    const storageTrie = new Trie()

    setupPreConditions(stateTrie, storageTrie, testData, done)

    function done() {
      resolve(storageTrie)
    }
 
  })
}

function exportTrieToD3Nodes(stateTrie, exportDone) {

  let NODE_LIST = []
 
  function walkTrieDone() {
    exportDone(JSON.stringify(NODE_LIST))
  }


  function onWalk(options, walkController) {
    options.id = options.childRef.toString('hex')
    delete options.childRef

    options.childData = options.childNode.raw
    //options.childAccount = options.childNode.raw[0].toString('hex')
    options.type = options.childNode.type
    var node = options.childNode
    if (node.type === 'leaf') {
      //var nodeAccount = new Account(options.childData[1])
      //options.nodeAccount = nodeAccount
    }
    options.childDataHex = []
    options.childDataHex[0] = options.childData[0].toString('hex')
    options.childDataHex[1] = options.childData[1].toString('hex')
    // branch index is options.childKey

    var key = options.childKey
    //var fullKey = options.childKey
    var fullKey = options.childKey

    if (node.key) {
      fullKey = key.concat(node.key)
    }


    options.fullKey = nibblesToBuffer(fullKey).toString('hex')
    options.childAccount = options.fullKey

    delete options.childNode
    NODE_LIST.push(options)
    var nodeRef = options.childRef

    if (node.type === 'leaf') {
      // found leaf node!
      walkController.next()
      //onFound(nodeRef, node, fullKey, walkController.next)
    } else if (node.type === 'branch' && node.value) {
      // found branch with value
      //onFound(nodeRef, node, fullKey, walkController.next)
      walkController.next()
    } else if (node.type === 'branch') {
      walkController.next()
    } else if (node.type === 'extention') {
      walkController.next()
    } else {
      // keep looking for value nodes
      walkController.next()
    }
  }
  stateTrie._walkTrie(stateTrie.root, onWalk, walkTrieDone)

}

function exportTrieToD3NodesProm(stateTrie, exportDone) {
  return new Promise((resolve, reject) => {
    exportTrieToD3Nodes(stateTrie, resolve)
  })
}


// graph functions
function renderTrie(data, width, height, preimages, isStorageTrie) {
  cout('>> renderTrie')
  if (isStorageTrie === undefined) {
    isStorageTrie = false
  }
  
  //const svg = DOM.svg(width, height);
  //const svg = document.getElementById('viz');
  const svg = d3.select('#viz')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
      
  //const g = d3.select('#viz').append("g")
  const g = svg.append('g')
      .attr("transform", "translate(40,80)");


  let tree = d3.tree()
      .size([width - 50, height - 250]);

  let root = d3.stratify()
        .id(function(d) { return d.id; })
        .parentId(function(d) { return d.parentId; })
        (data);

  var legend = g.selectAll(".legend")
      //.data(color.domain())
      .data([["leaf node","blue"],["branch node","purple"],["extension node","orange"]])
    .enter().append("g")
      .attr("class", "legend")
      .attr("transform", function(d, i) { return "translate(0," + (i * 25) + ")"; });

  legend.append("circle")
      .attr("cx", width - 60)
      .attr("r", 5.5)
      .style("fill", function(d) {
        return d[1];
      });

  legend.append("text")
      .attr("x", width - 75)
      .attr("y", 0)
      .attr("dy", ".35em")
      .style("text-anchor", "end")
      .text(function(d) {
        return d[0];
      });


  let link = g.selectAll(".link")
    .data(tree(root).links())

    link.enter().append("path").attr("class", "link")
        .merge(link)
      .attr("d", d3.linkVertical()
          .x(function(d) {
            return d.x;
          })
          .y(function(d) {
            return d.y;
          }));

  link.exit().remove()


  let node = g.selectAll(".node")
    .data(root.descendants())

  //let newNodes = node.enter()

  let newNodes = node.enter().append("g")
                  .merge(node)

  newNodes.attr("class", function(d) { return "node" + (d.children ? " node--internal" : " node--leaf"); })
      .attr("transform", function(d) {
        return "translate(" + d.x + "," + d.y + ")";
      })

  newNodes.append("circle")
      .attr("r", 5.5)
      .style("fill", function(d) {
        if (d.data.type === 'branch') {
          return "purple";
        }
        if (d.data.type === 'leaf') {
          return "blue";
        }
        if (d.data.type === 'extention') {
          return "orange";
        }
        //return d.color;
      });


  newNodes.append("text")
      .attr("class", "nodePath")
      .attr("dy", 0)
      .attr("x", function(d) { return -8 })
      .attr("y", function(d) { return -30 })
      .style("text-anchor", function(d) { return "end"; })
      .attr("transform", function(d) {
        return "rotate(50)";
      })


  newNodes.append("text")
      .attr("class", "nodeLabel")
      .attr("dy", 0)
      .attr("x", function(d) { return d.children ? -8 : -8; })
      .style("text-anchor", function(d) { return d.children ? "end" : "start"; })
      .attr("transform", function(d) {
        return "rotate(45)";
      })


  node.exit().remove()


  g.selectAll(".node").select("text.nodePath")
      .text(function(d) {
        let label = ''
        if (d.data.childKey.length > 0) {
          let hexKey = d.data.childKey.map(key => parseInt(key).toString(16))
          //label = label + "  key: " + hexKey
          label = "path: " + "[" + hexKey.join(', ') + "]"
        }
        return label
      })


  g.selectAll(".node").select("text.nodeLabel")
      .text(function(d) {
        var label = d.id.substr(0,8) + '...';
        if (d.data.type === 'branch') {
          if (d.data.childKey.length) {
            let hexKey = d.data.childKey.map(key => parseInt(key).toString(16)).join('')
            //branchStr = parseInt(branchKey).toString(16)
            label = label + "  key: " + hexKey
          }
          //label = label + "  nonce: " + d.data.nodeAccount.nonce
        }
        if (d.data.type === 'leaf') {
          /*
          data : childAccount : "f6dd4b4518b825d72d92bbcf06b9eed419823f31ce93f523740024a5c7c96fff"
          childData : (2) [{…}, {…}]
          childDataHex : (2) ["3d4b4518b825d72d92bbcf06b9eed419823f31ce93f523740024a5c7c96fff", "89bdbc41e0348b300000"]
          childKey : (3) [15, 6, 13]
          fullKey : "f6dd4b4518b825d72d92bbcf06b9eed419823f31ce93f523740024a5c7c96fff"
          id : "5065b15c4dfc01a951c332e1f836e5fac131df3b18d0862ef8c94977f774e60e"
          nodeAccount : {nonce: "0x", balance: "0x", stateRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421", codeHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"}
          parentId : "091e8f5efbff75bb0d849993bdb2f64c64b47744ad0561d8ef2cf4e0cf7c2350"
          type : "leaf"
          */
          if (d.data.childAccount && isStorageTrie === false) {
            let nodeAccount = new Account(d.data.childDataHex[1])
            var balStr = 0
            if (nodeAccount.balance.toString('hex') !== '') {
              balStr = parseInt(nodeAccount.balance.toString('hex'), 16)
            }
            var nonceStr = 0
            if (nodeAccount.nonce.toString('hex') !== '') {
              nonceStr = parseInt(nodeAccount.nonce.toString('hex'), 16)
            }
            const hashedAddress = d.data.childAccount
            const accountAddress = preimages[hashedAddress]
            label = "nodeHash: " + d.id.substr(0,8) + '...';
            label = label + "  address: " + accountAddress.substr(0,6) + ".." + accountAddress.substr(accountAddress.length - 4)
            label = label + "  sha3(address): " + d.data.childAccount.substr(0,16) + "..."
            label = label + "  balance: " + balStr
            label = label + "  nonce: " + nonceStr

            //console.log('nodeAccount.codeHash:', nodeAccount.codeHash)
            //console.log('nodeAccount.codeHash.toString:', nodeAccount.codeHash.toString('hex'))
            if (nodeAccount.codeHash.toString('hex') !== EMPTY_CODE_HASH) {
              label = label + "  codeHash: " + nodeAccount.codeHash.toString('hex').substr(0,8) + "..."
            }
            if (nodeAccount.stateRoot.toString('hex') !== EMPTY_TRIE_ROOT) {
              label = label + "  stateRoot: " + nodeAccount.stateRoot.toString('hex').substr(0,8) + "..."
            }
          } else {
            //console.log('storage leaf.')
            // rendering a storage trie
            let valueAbbrev = ""
            if (d.data.childDataHex[1].length > 8) {
              valueAbbrev = "..."
            }
            const hashedKey = d.data.fullKey
            const keyPreimage = preimages[hashedKey]
            label = "nodeHash: " + d.id.substr(0,8) + '...';
            label = label + " key: " + keyPreimage
            label = label + " sha3(key): " + hashedKey.substr(0,8) + "..."
            label = label + " value: " + d.data.childDataHex[1].substr(0,8) + valueAbbrev
          }

        }
        return label
      })
      .call(wrapTextLabel, 60);


  return svg;
}

function wrapTextLabel(text, width) {
  text.each(function() {
    var text = d3.select(this),
    words = text.text().split(/\s+/).reverse(),
    word,
    line = [],
    lineNumber = 0,
    y = text.attr("y"),
    dy = parseFloat(text.attr("dy")),
    lineHeight = 1.1, // ems
    tspan = text.text(null).append("tspan").attr("x", function(d) { return d.children || d._children ? -10 : 10; }).attr("y", y).attr("dy", dy + "em");     
    while (word = words.pop()) {
      line.push(word);
      tspan.text(line.join(" "));
      //let isTerminal = (word[word.length-1] === '.')
      //console.log('word: ' + word + '  isTerminal:', isTerminal)
      var textWidth = tspan.node().getComputedTextLength();
      //if (isTerminal || tspan.node().getComputedTextLength() > width) {
      //console.log('word:', word)
      var prevWord = ' '
      if (line.length >= 2) {
        prevWord = line[line.length-2] 
      }
      //console.log('prevWord:', prevWord)
      if (true && (prevWord[prevWord.length-1] !== ':')) {
          //console.log('doing next line..')
            line.pop();
            tspan.text(line.join(" "));
            line = [word];
            ++lineNumber;
            tspan = text.append("tspan").attr("x", function(d) { return d.children || d._children ? -10 : 10; }).attr("y", 0).attr("dy", lineNumber * lineHeight + dy + "em").text(word);
        }
    }
  });
}

// Some state data
var StateData = ({
	"0x1000000000000000000000000000000000000000": {
		"balance": "0x0de0b6b3a7640000",
		"code": "0x6040600060406000600173100000000000000000000000000000000000000162055730f1600055",
		"nonce": "0x00",
		"storage": {}
	},
	"0x1000000000000000000000000000000000000001": {
		"balance": "0x0de0b6b3a7640000",
		"code": "",
		"nonce": "0x00",
		"storage": {}
	},
	"0x1000000000000000000000000000000000000002": {
		"balance": "0x00",
		"code": "",
		"nonce": "0x00",
		"storage": {}
	},
	"0x1000000000000000000000000000000000347737": {
		"balance": "0x00",
		"code": "0xec553860ee553a60f055",
		"nonce": "0x00",
		"storage": {}
	},
	"0xa94f5374fce5edbc8e2a8697c15331677e6ebf0b": {
		"balance": "0x0de0b6b3a7640000",
		"code": "",
		"nonce": "0x00",
		"storage": {}
	}
})
  
// render the trie
/*
trieChart = {
  return initStateTree(StateData).then(function(stateTrieObj) {
    //console.log('initStateTree promise result stateTrieObj:', stateTrieObj)
    return exportTrieToD3NodesProm(stateTrieObj)
  }).then(d3Data => {
    console.log('exportTrieToD3NodesProm returned d3Data:', d3Data)
    const trieData = JSON.parse(d3Data)
    let leafNodes = trieData.filter(node => node.type === "leaf")
    const svgWidth = Math.round(leafNodes.length * 130)
    const svgHeight = 800

    const preimages = addressPreimages(StateData)
    // renderTrie returns the svg object
    return renderTrie(trieData, svgWidth, svgHeight, preimages)
  })
}
*/


//var trieChart = {

//}

function cout() {
  var log = document.getElementById('log')
  for (var i = 0; i < arguments.length; i++) {
    if (typeof(arguments[i]) === 'string') {
      log.innerHTML = log.innerHTML + arguments[i] + '\n'
    } else {
      try {
        log.innerHTML = log.innerHTML + JSON.stringify(arguments[i], undefined, 2) + '\n'
      } catch {
        log.innerHTML = log.innerHTML + arguments[i] + '\n'
      }
    }
  }
  log.innerHTML + '\n'
}


function showStuff () {
  var pre = document.getElementById('state1')
  pre.innerHTML = JSON.stringify(StateData, undefined, 2)

  initStateTree(StateData).then(stateTrieObj => {
    console.log('StateTrie: ', stateTrieObj)
    return exportTrieToD3NodesProm(stateTrieObj)
  }).then(d3Data => {
    cout('exportTrieToD3NodesProm returned d3Data:', d3Data)
    const trieData = JSON.parse(d3Data)
    let leafNodes = trieData.filter(node => node.type === "leaf")
    const svgWidth = Math.round(leafNodes.length * 130)
    const svgHeight = 800

    const preimages = addressPreimages(StateData)
    // renderTrie returns the svg object
    return renderTrie(trieData, svgWidth, svgHeight, preimages)
  })  
}
