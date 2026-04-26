/**
 * Gigs4You Website - Main JavaScript
 * Handles pricing toggle, mobile menu, animations, and form submission
 */

// ───────────────────────────────────────────────────────────────
// 1. PRICING TOGGLE (Monthly ↔ Annual)
// ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  const billingToggle = document.getElementById('billingToggle');
  
  if (billingToggle) {
    billingToggle.addEventListener('change', function () {
      const isAnnual = this.checked;
      const priceElements = document.querySelectorAll('.price-amount');
      
      priceElements.forEach(el => {
        const monthlyPrice = el.getAttribute('data-monthly');
        const annualPrice = el.getAttribute('data-annual');
        
        if (isAnnual && annualPrice) {
          // Format: remove commas, add them back
          const formatted = parseInt(annualPrice).toLocaleString('en-US');
          el.textContent = formatted;
        } else if (monthlyPrice) {
          const formatted = parseInt(monthlyPrice).toLocaleString('en-US');
          el.textContent = formatted;
        }
      });
    });
  }

  // ───────────────────────────────────────────────────────────────
  // 2. MOBILE MENU TOGGLE
  // ───────────────────────────────────────────────────────────────

  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('active');
      navToggle.classList.toggle('active');
    });
    
    // Close menu when a link is clicked
    const navItems = navLinks.querySelectorAll('a');
    navItems.forEach(link => {
      link.addEventListener('click', function () {
        navLinks.classList.remove('active');
        navToggle.classList.remove('active');
      });
    });
  }

  // ───────────────────────────────────────────────────────────────
  // 3. SCROLL ANIMATIONS (Intersection Observer)
  // ───────────────────────────────────────────────────────────────

  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const animationType = element.getAttribute('data-animate');
        const delay = parseInt(element.getAttribute('data-delay')) || 0;
        
        setTimeout(() => {
          element.style.opacity = '1';
          element.style.transform = getTransformEnd(animationType);
          element.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        }, delay);
        
        observer.unobserve(element);
      }
    });
  }, observerOptions);

  // Observe all elements with data-animate
  document.querySelectorAll('[data-animate]').forEach(el => {
    const animationType = el.getAttribute('data-animate');
    
    // Set initial state
    el.style.opacity = '0';
    el.style.transform = getTransformStart(animationType);
    el.style.transition = 'none';
    
    observer.observe(el);
  });

  function getTransformStart(type) {
    const transforms = {
      'fade-up': 'translateY(30px)',
      'fade-down': 'translateY(-30px)',
      'fade-left': 'translateX(-30px)',
      'fade-right': 'translateX(30px)',
      'fade': 'scale(0.95)'
    };
    return transforms[type] || 'none';
  }

  function getTransformEnd(type) {
    return 'none'; // All animations end at default position
  }

  // ───────────────────────────────────────────────────────────────
  // 4. FAQ ACCORDION
  // ───────────────────────────────────────────────────────────────

  const faqItems = document.querySelectorAll('.faq-item');
  
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-q');
    
    if (question) {
      question.addEventListener('click', function () {
        const isOpen = item.classList.contains('open');
        
        // Close all other items
        faqItems.forEach(otherItem => {
          otherItem.classList.remove('open');
        });
        
        // Toggle current item
        if (!isOpen) {
          item.classList.add('open');
        }
      });
    }
  });

  // ───────────────────────────────────────────────────────────────
  // 5. CONTACT FORM SUBMISSION
  // ───────────────────────────────────────────────────────────────

  const contactForm = document.getElementById('contactForm');
  
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      
      // Get form data
      const formData = new FormData(this);
      const data = {
        name: formData.get('name') || this.querySelector('input[placeholder*="Michael"]')?.value,
        phone: formData.get('phone') || this.querySelector('input[placeholder*="0712"]')?.value,
        company: formData.get('company') || this.querySelector('input[placeholder*="Bidco"]')?.value,
        agents: formData.get('agents') || this.querySelector('select')?.value,
        message: formData.get('message') || this.querySelector('textarea')?.value
      };

      // Collect from actual form inputs (fallback if name attributes missing)
      const inputs = this.querySelectorAll('input, textarea, select');
      if (inputs.length > 0) {
        data.name = inputs[0]?.value || data.name;
        data.phone = inputs[1]?.value || data.phone;
        data.company = inputs[2]?.value || data.company;
        data.agents = this.querySelector('select')?.value || data.agents;
        data.message = this.querySelector('textarea')?.value || data.message;
      }

      // Validate
      if (!data.name || !data.phone) {
        alert('Please fill in your name and phone number.');
        return;
      }

      // Send to API
      const submitBtn = this.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      fetch('http://localhost:3000/api/v1/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })
        .then(res => res.json())
        .then(result => {
          alert('Thank you! We\'ll be in touch within 24 hours.');
          contactForm.reset();
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        })
        .catch(err => {
          // Fallback: send via email if API not available
          console.error('API error:', err);
          const subject = `New Gigs4You Contact: ${data.name} (${data.agents} agents)`;
          const body = `Name: ${data.name}\nPhone: ${data.phone}\nCompany: ${data.company}\nMessage: ${data.message}`;
          window.location.href = `mailto:hello@gigs4you.co.ke?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        });
    });
  }

  // ───────────────────────────────────────────────────────────────
  // 6. SMOOTH SCROLL & ANCHOR LINKS
  // ───────────────────────────────────────────────────────────────

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 7. HEADER SCROLL EFFECT (Add shadow on scroll)
  // ───────────────────────────────────────────────────────────────

  const header = document.querySelector('header');
  if (header) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 10) {
        header.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
      } else {
        header.style.boxShadow = 'none';
      }
    });
  }

  // ───────────────────────────────────────────────────────────────
  // 8. CTA BUTTON HANDLERS
  // ───────────────────────────────────────────────────────────────

  // "Start free trial" buttons redirect to dashboard signup
  document.querySelectorAll('a[href*="trial"], .btn-primary').forEach(btn => {
    if (btn.textContent.includes('Start free trial') || btn.textContent.includes('Sign In')) {
      btn.href = 'http://localhost:3001';
      btn.target = '_blank';
    }
  });

  // ── Plan CTA buttons: redirect to dashboard with plan pre-selected ──
  const DASHBOARD_URL = 'http://localhost:3001';
  const planNameToId = {
    'free trial': 'free',
    'starter':    'starter',
    'growth':     'growth',
    'scale':      'scale',
    'enterprise': 'enterprise',
  };

  document.querySelectorAll('.plan-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      const card = btn.closest('.pricing-card');
      const rawName = card?.querySelector('.plan-name')?.textContent?.toLowerCase()?.trim() || '';
      const planId  = planNameToId[rawName] || 'starter';
      const isAnnual = document.getElementById('billingToggle')?.checked;
      const billing  = isAnnual ? 'annual' : 'monthly';

      if (planId === 'enterprise') {
        // Enterprise: scroll to contact form
        const contact = document.querySelector('#contact');
        if (contact) contact.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const token = localStorage.getItem('token');
      if (token) {
        // Already logged in — go straight to billing
        window.location.href = `${DASHBOARD_URL}/billing?autoUpgrade=${planId}&billing=${billing}`;
      } else {
        // Not logged in — go to register with plan pre-selected
        window.location.href = `${DASHBOARD_URL}/login?plan=${planId}&billing=${billing}`;
      }
    });
  });
});

// ───────────────────────────────────────────────────────────────
// 9. UTILITY: Ready state checker
// ───────────────────────────────────────────────────────────────

function log(message) {
  if (typeof console !== 'undefined') {
    console.log('[Gigs4You] ' + message);
  }
}

log('Website initialized - pricing toggle, mobile menu, animations, and forms ready.');
