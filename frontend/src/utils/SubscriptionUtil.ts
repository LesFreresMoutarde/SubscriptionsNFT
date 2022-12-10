import {BigNumber, Contract, ethers, providers} from "ethers";
import SUBSCRIPTION_JSON from "../artifacts/contracts/Subscription.sol/Subscription.json";
import {getChainlinkEthUsdPriceFeed} from "./OracleUtils";
import {areAdressesEqual} from "./Util";

function getSubscriptionContract(provider: providers.Web3Provider, address: string): Contract {
    return new ethers.Contract(address, SUBSCRIPTION_JSON.abi, provider.getSigner());
}

async function getBalanceOfOwnedTokens(contract: Contract, address: string): Promise<BigNumber> {
    return await contract.balanceOf(address);
}

async function getOwnedTokensByUser(contract: Contract, address: string, balance: bigint|number): Promise<BigNumber[]> {
    const tokenIds: BigNumber[] = [];

    for (let i = 0; i < balance; i++) {
        tokenIds.push(await contract.tokenOfOwnerByIndex(address, i))
    }

    return tokenIds;
}

async function getBalanceOfUsedTokens(contract: Contract, address: string): Promise<BigNumber> {
    return await contract.usedBalanceOf(address);
}

async function getUsedTokensByUser(contract: Contract, address: string, balance: bigint|number): Promise<BigNumber[]> {
    const tokenIds: BigNumber[] = [];

    for (let i = 0; i < balance; i++) {
        tokenIds.push(await contract.tokenOfUserByIndex(address, i))
    }

    return tokenIds;
}

async function isRentingExpired(contract: Contract, tokenId: BigNumber): Promise<boolean> {
    const rentExpiration = await contract.userExpires(tokenId) * 1000;

    return Date.now() >= rentExpiration;
}

async function isContentAvailableFromToken(contract: Contract, tokenId: BigNumber, type: 'owned' | 'used'): Promise<boolean> {
    const subscriptionExpirationTimestamp = await contract.expiresAt(tokenId) * 1000;

    if (Date.now() >= subscriptionExpirationTimestamp) {
        return false;
    }

    switch (type) {
        case 'owned':
            const user = await contract.userOf(tokenId);

            if (user !== ethers.constants.AddressZero) {
                return false;
            }

            break;
        case 'used':
            const rentExpiration = await contract.userExpires(tokenId) * 1000;

            if (Date.now() >= rentExpiration) {
                return false;
            }

            break;
        default:
            return false;
    }

    return true;
}

// Returns true if token owner can create a renting offer
async function isTokenRentable(contract: Contract, tokenId: BigNumber, address: string) {
    const ownerOf = await contract.ownerOf(tokenId);

    if (ethers.utils.getAddress(address) !== ownerOf) {
        return false;
    }

    const subscriptionExpiration = await contract.expiresAt(tokenId) * 1000;

    if (Date.now() > subscriptionExpiration) {
        return false;
    }

    const userOf = await contract.userOf(tokenId);

    if (userOf !== ethers.constants.AddressZero) {
        return false;
    }

    return true;
}

// Returns true if user can borrow token
async function isTokenBorrowable(contract: Contract, tokenId: BigNumber, address: string) {
    const ownerOf = await contract.ownerOf(tokenId);

    if (areAdressesEqual(address, ownerOf)) {
        return false;
    }

    // Check that token subscription will not expire before renting expiration

    const subscriptionExpiration = await contract.expiresAt(tokenId) * 1000;

    const rentingConditions = await contract.getRentingConditions(tokenId);

    if (rentingConditions.createdAt.eq(0)) {
        return false;
    }

    const rentingDuration = await rentingConditions.duration.mul(1000);

    const rentingExpiration: BigNumber = rentingDuration.add(Date.now());

    if (rentingExpiration.gt(subscriptionExpiration)) {
        return false;
    }

    return true;
}

async function isTokenReclaimable(contract: Contract, tokenId: BigNumber, address: string) {
    const ownerOf = await contract.ownerOf(tokenId);

    if (ethers.utils.getAddress(address) !== ownerOf) {
        return false;
    }

    const userOf = await contract.userOf(tokenId);

    if (userOf === ethers.constants.AddressZero){
        return false;
    }

    const userExpires = await contract.userExpires(tokenId) * 1000;

    if (Date.now() < userExpires) {
        return false;
    }

    return true;
}

async function getSubscriptionPrice(contract: Contract) {
    return await contract.contentSubscriptionPrice();
}

async function mintToken(contract: Contract, provider: providers.Web3Provider) {
    const contentSubscriptionPrice = await getSubscriptionPrice(contract);

    const {rate, decimals} = await getChainlinkEthUsdPriceFeed(provider)

    const rateWithDecimalsBN = rate.div(BigNumber.from((10 ** decimals).toString()));

    const amountToSend = BigNumber.from(contentSubscriptionPrice).mul(BigNumber.from((10 ** 18).toString())).div(rateWithDecimalsBN).div(100);

    await contract.mint({value: amountToSend});
}

async function reclaimToken(contract: Contract, provider: providers.Web3Provider, tokenId: BigNumber) {
    await contract.reclaim(tokenId);
}

export {
    getSubscriptionContract,
    getBalanceOfOwnedTokens,
    getBalanceOfUsedTokens,
    getUsedTokensByUser,
    getOwnedTokensByUser,
    isRentingExpired,
    isContentAvailableFromToken,
    isTokenRentable,
    isTokenBorrowable,
    isTokenReclaimable,
    getSubscriptionPrice,
    mintToken,
    reclaimToken,
}
