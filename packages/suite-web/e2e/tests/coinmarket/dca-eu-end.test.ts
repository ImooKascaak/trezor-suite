// @group:coinmarket

describe('Coinmarket DCA EU End', () => {
    beforeEach(() => {
        cy.task('startEmu', { wipe: true });
        // cy.task('setupEmu', { needs_backup: false });
        // cy.task('startBridge');

        cy.task('setupEmu', {
            needs_backup: false,
            mnemonic:
                'alcohol woman abuse must during monitor noble actual mixed trade anger aisle',
        });
        cy.task('startBridge');

        cy.viewport(1024, 768).resetDb();
        cy.interceptInvityApiSavingsBtcDirect();
        cy.prefixedVisit('/');
        cy.passThroughInitialRun();
        cy.discoveryShouldFinish();

        // Navigate to DCA Savings
        cy.getTestElement('@suite/menu/wallet-index').click();
        cy.getTestElement('@account-menu/add-account').click();
        cy.getTestElement('@settings/wallet/network/btc').click();
        cy.getTestElement('@add-account').click();
        cy.getTestElement('@wallet/menu/wallet-coinmarket-buy').click();
        cy.getTestElement('@coinmarket/menu/wallet-coinmarket-savings').click();
    });

    /**
     * Test Case Scenario
     * 1. Navigates to a Accounts/BTC account/Save Bitcoin. The given fixtures will mock data from Invity.io
     * 2. Checks the receiving address is visible and matches
     * 3. Clicks on Confirm setup
     */

    it('DCA EU Flow Conclusion', () => {
        // Check the receiving address is displayed
        // Click on the confirm button
        // 
        // 
        
    });
});

export {};
