// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Hamsterverse is ERC721, Ownable {
    constructor(address initialOwner) ERC721("Hamsterverse", "HAM") Ownable(initialOwner) {
        _safeMint(initialOwner, 1);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "x";
    }
}
