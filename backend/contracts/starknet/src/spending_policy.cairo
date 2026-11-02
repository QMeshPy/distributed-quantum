/// Session spends revert unless they stay inside the agent caps.
/// Each agent row stores its own caps, expiry, session key, revoke flag,
/// daily spend counter, and nonce. The Ready owner signs `register_session`,
/// `revoke_session`, and owner `spend` (Get STRK to the row recipient).
/// Session-key `spend` checks an ECDSA signature from `session_public_key`
/// over `(agent_key, payee, amount, nonce, contract, chain_id)` and shares
/// the row's `spent_today` and `nonce`.
use starknet::ContractAddress;

#[starknet::interface]
trait ISpendingPolicy<TContractState> {
    fn register_session(
        ref self: TContractState,
        agent_key: felt252,
        token: ContractAddress,
        recipient: ContractAddress,
        max_per_call: u256,
        daily_limit: u256,
        expires_at: u64,
        session_public_key: felt252,
    );
    fn spend(
        ref self: TContractState,
        agent_key: felt252,
        amount: u256,
        payee: ContractAddress,
        nonce: u64,
        r: felt252,
        s: felt252,
    );
    fn revoke_session(ref self: TContractState, agent_key: felt252);
}

#[starknet::interface]
trait IErc20<TContractState> {
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
}

#[starknet::contract]
mod SpendingPolicy {
    use core::ecdsa::check_ecdsa_signature;
    use core::pedersen::pedersen;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{
        ContractAddress, get_block_timestamp, get_caller_address, get_contract_address,
        get_tx_info,
    };
    use super::{IErc20Dispatcher, IErc20DispatcherTrait};

    const DAY: u64 = 86400;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        registered: Map<felt252, bool>,
        token: Map<felt252, ContractAddress>,
        recipient: Map<felt252, ContractAddress>,
        max_per_call: Map<felt252, u256>,
        daily_limit: Map<felt252, u256>,
        expires_at: Map<felt252, u64>,
        session_public_key: Map<felt252, felt252>,
        revoked: Map<felt252, bool>,
        day_index: Map<felt252, u64>,
        spent_today: Map<felt252, u256>,
        nonce: Map<felt252, u64>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
    }

    fn spend_message_hash(
        agent_key: felt252,
        payee: ContractAddress,
        amount: u256,
        nonce: u64,
        contract: ContractAddress,
        chain_id: felt252,
    ) -> felt252 {
        let h0 = pedersen(0, agent_key);
        let h1 = pedersen(h0, payee.into());
        let h2 = pedersen(h1, amount.low.into());
        let h3 = pedersen(h2, amount.high.into());
        let h4 = pedersen(h3, nonce.into());
        let h5 = pedersen(h4, contract.into());
        let h6 = pedersen(h5, chain_id);
        pedersen(h6, 7)
    }

    #[abi(embed_v0)]
    impl SpendingPolicyImpl of super::ISpendingPolicy<ContractState> {
        fn register_session(
            ref self: ContractState,
            agent_key: felt252,
            token: ContractAddress,
            recipient: ContractAddress,
            max_per_call: u256,
            daily_limit: u256,
            expires_at: u64,
            session_public_key: felt252,
        ) {
            assert(get_caller_address() == self.owner.read(), 'owner');
            assert(agent_key != 0, 'agent');
            assert(max_per_call > 0 && max_per_call <= daily_limit, 'per_call');
            assert(expires_at > get_block_timestamp(), 'expired');
            assert(token.into() != 0 && recipient.into() != 0, 'token');
            assert(session_public_key != 0, 'session_key');
            self.registered.write(agent_key, true);
            self.token.write(agent_key, token);
            self.recipient.write(agent_key, recipient);
            self.max_per_call.write(agent_key, max_per_call);
            self.daily_limit.write(agent_key, daily_limit);
            self.expires_at.write(agent_key, expires_at);
            self.session_public_key.write(agent_key, session_public_key);
            self.revoked.write(agent_key, false);
            self.day_index.write(agent_key, get_block_timestamp() / DAY);
            self.spent_today.write(agent_key, 0);
            self.nonce.write(agent_key, 0);
        }

        fn spend(
            ref self: ContractState,
            agent_key: felt252,
            amount: u256,
            payee: ContractAddress,
            nonce: u64,
            r: felt252,
            s: felt252,
        ) {
            assert(self.registered.read(agent_key), 'revoked');
            assert(!self.revoked.read(agent_key), 'revoked');
            let now = get_block_timestamp();
            assert(now < self.expires_at.read(agent_key), 'expired');
            assert(amount > 0 && amount <= self.max_per_call.read(agent_key), 'per_call');
            assert(payee.into() != 0, 'recipient');

            let current_nonce = self.nonce.read(agent_key);
            assert(nonce == current_nonce, 'nonce');

            let caller = get_caller_address();
            let row_recipient = self.recipient.read(agent_key);
            if caller == self.owner.read() && payee == row_recipient {
                // Owner Get STRK withdrawal to the row's registered recipient.
            } else {
                let tx_info = get_tx_info().unbox();
                let message = spend_message_hash(
                    agent_key,
                    payee,
                    amount,
                    nonce,
                    get_contract_address(),
                    tx_info.chain_id,
                );
                let pub_key = self.session_public_key.read(agent_key);
                assert(check_ecdsa_signature(message, pub_key, r, s), 'signature');
            }

            let day = now / DAY;
            let mut spent = self.spent_today.read(agent_key);
            if day != self.day_index.read(agent_key) {
                spent = 0;
                self.day_index.write(agent_key, day);
            }
            let next = spent + amount;
            assert(next <= self.daily_limit.read(agent_key), 'daily');
            self.spent_today.write(agent_key, next);
            self.nonce.write(agent_key, current_nonce + 1);
            let token = IErc20Dispatcher { contract_address: self.token.read(agent_key) };
            let ok = token.transfer(payee, amount);
            assert(ok, 'transfer');
        }

        fn revoke_session(ref self: ContractState, agent_key: felt252) {
            assert(get_caller_address() == self.owner.read(), 'owner');
            self.revoked.write(agent_key, true);
        }
    }
}

