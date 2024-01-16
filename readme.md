## Welcome to ChipSync

### Purpose

ChipSync is a meta-protocol library, written in Typescript, for performing transactions within a network of nodes.  This library was built to affect "lifts" in [MyChips](https://github.com/gotchoices/MyCHIPs), but may be suitable for other peer-to-peer systems.  This library compliments [ChipNet](https://github.com/gotchoices/ChipNet), which is used for path discovery, and for creating plans which this library may be used to execute on.

This is described as a meta-protocol because this library does not handle communications, state persistence, and other characterics, but rather these are furnished by the library user.

This library provides the following capabilities:

* [Transactions](doc/transaction.md) - distributed transactions using star or ring voting consensus
    
### Development

* Build: npm run build
	* Builds into an ES module
* Test: npm test
* Install Jest VSCode extension for easy test debugging
