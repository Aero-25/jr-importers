import React from 'react';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import AuthModal from './components/AuthModal.jsx';
import { Icon } from './components/ui.jsx';
import { useRouter, useSettings } from './lib/store.jsx';

import Home from './views/Home.jsx';
import Catalog from './views/Catalog.jsx';
import Product from './views/Product.jsx';
import Checkout from './views/Checkout.jsx';
import Account from './views/Account.jsx';
import Contact from './views/Contact.jsx';

function Routes() {
  const route = useRouter();
  const [first, second] = route.parts;

  switch (first) {
    case undefined: return <Home />;
    case 'shop': return <Catalog />;
    case 'product': return <Product id={second} />;
    case 'checkout': return <Checkout />;
    case 'account': return <Account />;
    case 'contact': return <Contact />;
    default: return <Home />;
  }
}

export default function App() {
  const s = useSettings();
  return (
    <>
      <Header />
      <main id="main">
        <Routes />
      </main>
      <Footer />
      <CartDrawer />
      <AuthModal />
      <a className="wa-float" href={`https://wa.me/${s.store_whatsapp}`} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp">
        <Icon.whatsapp />
      </a>
    </>
  );
}
