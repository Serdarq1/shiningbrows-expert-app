// The primary device language controls both the interface and price visibility.
(() => {
  const primary = (navigator.languages?.[0] || navigator.language || "en").toLowerCase();
  const language = primary.split(/[-_]/)[0] === "tr" ? "tr" : "en";
  document.documentElement.lang = language;
  const messages = {
    "Ana Sayfa": "Home", "Anasayfa": "Home", "Panel": "Home", "Hızlı Bilgiler": "Quick tips",
    "Profil": "Profile", "Ürünler": "Products", "Siparişler": "Orders", "Uzmanlar": "Experts",
    "Uzman": "Expert", "Uzman Akışı": "Expert feed", "Kampanyalar": "Offers", "Workshoplar": "Workshops",
    "Medya": "Media", "Destek": "Support", "Çıkış Yap": "Sign out", "Çıkış": "Sign out",
    "Giriş Yap": "Sign in", "Kayıt Ol": "Sign up", "E-posta": "Email", "E-posta Adresi": "Email address",
    "Şifre": "Password", "Şifremi Unuttum": "Forgot password", "Şifremi unuttum": "Forgot password",
    "Hesabınız yok mu?": "Don't have an account?", "Zaten hesabınız var mı?": "Already have an account?",
    "Ad Soyad": "Full name", "Adınız": "First name", "Soyadınız": "Last name", "Ad": "First name", "Soyad": "Last name",
    "Telefon": "Phone", "Telefon Numarası": "Phone number", "Ülke": "Country", "Kaydet": "Save",
    "Güncelle": "Update", "İptal": "Cancel", "Sil": "Delete", "Düzenle": "Edit", "Gönder": "Send",
    "Ekle": "Add", "Sepete Ekle": "Add to cart", "Sepete eklendi": "Added to cart",
    "Sepetiniz güncellendi.": "Your cart has been updated.", "Sepetiniz boş.": "Your cart is empty.",
    "Sepet": "Cart", "Sepetim": "My cart", "Sepeti Aç": "Open cart", "Sepeti Temizle": "Clear cart",
    "Sipariş Ver": "Place order", "Siparişi Gönder": "Submit order", "Sipariş Geçmişi": "Order history",
    "Toplam": "Total", "Ara Toplam": "Subtotal", "Adet": "Quantity", "Kapat": "Close",
    "← Siparişlere dön": "← Back to orders", "Uygulama Adımları": "Application steps",
    "Diğer Profesyonel Ürünler": "Other professional products", "Ev Kullanımına Uygun Diğer Ürünler": "Other home care products",
    "Önerilen Ürünler": "Recommended products", "Ürün Bilgileri": "Product information",
    "Profesyonel kullanım için özel: 3 ürün alımında 1 ürün hediye gönderilir.": "Professional offer: buy 3 products and receive 1 free.",
    "Ev kullanımına özel: 5 ürün alımında 1 ürün hediye gönderilir.": "Home care offer: buy 5 products and receive 1 free.",
    "Bilgiler yüklenemedi. Lütfen tekrar deneyin.": "Could not load information. Please try again.",
    "Yükleniyor...": "Loading...", "Önceki": "Previous", "Sonraki": "Next", "Geri": "Back",
    "Girişe dön": "Back to sign in", "Giriş Yapın": "Sign in", "Kod Gönder": "Send code",
    "Şifreyi Güncelle": "Update password", "Yeni Şifre": "New password", "Doğrulama Kodu": "Verification code",
    "Şifreyi göster": "Show password", "Şifreyi gizle": "Hide password", "Misafir olarak devam et": "Continue as guest",
    "Bir şeyler ters gitti. Lütfen tekrar deneyin.": "Something went wrong. Please try again.",
    "Şifre hatalı. Lütfen tekrar deneyin.": "Incorrect password. Please try again.",
    "Bu e-posta adresiyle bir hesap bulunamadı.": "No account was found with this email address.",
    "Doğrulama kodu hatalı. Lütfen tekrar deneyin.": "Incorrect verification code. Please try again.",
    "Çok fazla deneme yapıldı. Lütfen biraz bekleyin.": "Too many attempts. Please wait a moment.",
    "Hesap": "Account", "Hesap Bilgileri": "Account information", "Profil Bilgileri": "Profile information",
    "Profil Fotoğrafı": "Profile photo", "Fotoğraf Yükle": "Upload photo", "Fotoğraflarım": "My photos",
    "Fotoğraflar": "Photos", "Fotoğraf": "Photo", "Açıklama": "Description", "Konu": "Subject", "Mesaj": "Message",
    "Sıkça Sorulan Sorular": "Frequently asked questions", "Destek Talebi": "Support request",
    "Kurallar": "Rules", "Eğitim": "Training", "Eğitim İçerikleri": "Training materials",
    "Kullanım": "Usage", "Uyarılar": "Warnings", "Bakım": "Aftercare", "Kontrendikasyonlar": "Contraindications",
    "Kitap": "Book", "Kitaplar": "Books", "Videolar": "Videos", "Kitabı Aç": "Open book",
    "Yaklaşan Workshoplar": "Upcoming workshops", "Canlı Workshop": "Live workshop", "Katıl": "Join",
    "Tarih": "Date", "Konum": "Location", "Eğitmen": "Instructor", "Başlık": "Title",
    "Aktif": "Active", "Bildirimler": "Notifications", "Yeni bildirim yok.": "No new notifications.",
    "Workshop Tamamlama:": "Workshop completion:", "Uzman ID": "Expert ID", "Misafir": "Guest",
    "Siparişiniz alındı.": "Your order has been received.", "Henüz siparişiniz yok.": "You have no orders yet.",
    "Tümünü Göster": "Show all", "Daha Fazla": "More", "Aylık Kazanan": "Monthly winner",
    "Bu Ayın Kazananı": "This month's winner", "Feedback bırak": "Leave feedback", "Gözlemini yaz": "Write your observation",
  };
  Object.assign(messages, {
  "Hesabınıza erişmek için bilgilerinizi girin": "Enter your details to access your account",
  "Hesap oluşturmak için bilgilerinizi girin": "Enter your details to create an account",
  "Kullanım Koşullarını": "Terms of Use",
  "ve": "and",
  "Gizlilik Politikasını": "Privacy Policy",
  "kabul ediyorum.": "I agree.",
  "Şifreyi Onayla": "Confirm password",
  "Şifrenizi girin": "Enter your password",
  "Yeni şifrenizi girin": "Enter your new password",
  "Şifreyi göster/gizle": "Show/hide password",
  "Şifrenizi sıfırlamak için e-posta adresinizi girin. Size bir doğrulama kodu göndereceğiz.": "Enter your email to reset your password. We will send you a verification code.",
  "E-postanıza gönderilen kodu ve yeni şifrenizi girin.": "Enter the code sent to your email and your new password.",
  "E-postanıza gönderilen doğrulama kodunu girin. E-postayı bulamıyorsanız spam/gereksiz klasörünüzü kontrol edin.": "Enter the verification code sent to your email. Check your spam folder if you cannot find it.",
  "Kodu tekrar gönder": "Resend code",
  "Hızlı Bilgiler & Kısıtlamalar ve Kurallar": "Quick tips, restrictions and rules",
  "Bir bildirim bulunmamaktadır.": "No notifications.",
  "Dijital Sertifika": "Digital certificate",
  "Atölye": "Workshop",
  "Tamamlama:": "Completed:",
  "Kurallar & Kısıtlamalar": "Rules and restrictions",
  "Fotoğrafı Güncelle": "Update photo",
  "Profil Ayarları": "Profile settings",
  "Uzmanlık Durumu:": "Expert status:",
  "Profil güncellendi.": "Profile updated.",
  "Hesap Yönetimi": "Account management",
  "Hesap ayarları, şifre güncelleme, çıkış ve hesap silme için menüye tıkladıktan sonra açılan kısımda profil resminize tıklayın.": "Open the menu and select your profile picture to manage your account, change your password, sign out or delete your account.",
  "Önceki Siparişler": "Previous orders",
  "0 ürün": "0 items",
  "Sipariş Onayı": "Order confirmation",
  "Hayır": "No",
  "Evet": "Yes",
  "Workshop Başvurusu": "Workshop registration",
  "Workshop yayını": "Workshop broadcast",
  "Bağlantı kuruluyor...": "Connecting...",
  "Mikrofonu Kapat": "Mute microphone",
  "Kamerayı Kapat": "Turn camera off",
  "Ekran Paylaş": "Share screen",
  "Yayını Bitir": "End broadcast",
  "Odadan Ayrıl": "Leave room",
  "Hazırlanıyor...": "Preparing...",
  "Katılımcılar": "Participants",
  "Henüz kimse bağlanmadı.": "No one has joined yet.",
  "Canlı yayın kapandığında katılımcılar otomatik olarak yayından atılır. Sadece Masterlar ve admin yayını bitirebilir.": "Participants leave automatically when the broadcast ends. Only Masters and admins can end the broadcast.",
  "Tam Ekran": "Full screen",
  "Çık": "Exit",
  "Tam Ekrandan Çık": "Exit full screen",
  "Akış": "Feed",
  "Sadece Kazananı Görüntüle": "Show winner only",
  "Kazananı Üste Sabitle": "Pin winner to top",
  "İşlem Fotoğraflarım": "My treatment photos",
  "Şu anda geçerli bir kampanya bulunmuyor.": "There are no current offers.",
  "Kampanya Yönetimi (Admin)": "Offer management (Admin)",
  "Kampanya Kaydet": "Save offer",
  "Düzenlemeyi İptal Et": "Cancel editing",
  "Kampanya kaydedildi.": "Offer saved.",
  "Sıradaki Workshoplar": "Upcoming workshops",
  "Canlı": "Live",
  "Workshop Yayını": "Workshop broadcast",
  "Henüz aktif yayın yok.": "There is no active broadcast.",
  "Yeni Workshop Ekle (Admin)": "Add workshop (Admin)",
  "Yeni workshop kaydedildi.": "Workshop saved.",
  "Uzmanlık": "Expertise",
  "Uzman Profili": "Expert profile",
  "E-Kitap": "E-book",
  "Mobilde tam ekran izlemek için indir kısmına tıklayın.": "Tap download to view full screen on mobile.",
  "PDF indir": "Download PDF",
  "PDF yüklenmedi.": "No PDF uploaded.",
  "PDF kitabı yüklemek için dosyayı seçin.": "Choose a file to upload the PDF book.",
  "PDF Yükle": "Upload PDF",
  "PDF yüklendi.": "PDF uploaded.",
  "Mux'taki videonun Playback ID'sini yapıştırın. Playback ID yoksa herkese açık bir video linki girin.": "Paste the video's Mux Playback ID, or enter a public video URL.",
  "Video Ekle": "Add video",
  "Video yüklendi.": "Video uploaded.",
  "WhatsApp ile İletişime Geç": "Contact us on WhatsApp",
  "Sorularınız için tıklayın": "Tap to ask a question",
  "Güzelliğin Bir Adım Ötesi": "One step beyond beauty",
  "Hybrid Formül": "Hybrid formula",
  "SHINING BROWS EXPERT REHBERİ": "SHINING BROWS EXPERT GUIDE",
  "Sertifika ve Uygulama Yetkisi": "Certification and authorization",
  "Sürekli Gelişim": "Continuous development",
  "Master Assistant Rolü": "The Master Assistant role",
  "Shining Brows App’e hoş geldiniz.": "Welcome to the Shining Brows app.",
  "NEDEN SHINING BROWS?": "WHY SHINING BROWS?",
  "Shining Brows Academy, yalnızca ürün üreten bir marka değil; bilgi, kalite ve kariyer inşa eden bütüncül bir sistemdir.": "Shining Brows Academy is a comprehensive system that develops knowledge, quality and careers alongside its products.",
  "Shining Brows, kaliteyi seçenler, uzmanlaşmak isteyenler ve kariyerini büyütmeyi hedefleyenler için vardır.": "Shining Brows is for people who choose quality, develop their expertise and grow their careers.",
  "Shining Brows dünyasını daha yakından tanımak ve ayrıcalıklı içerikleri keşfetmek için uygulamamızı inceleyebilirsiniz.": "Explore our app to discover the world of Shining Brows and its exclusive content.",
  "Bilimsel altyapı, yüksek kalite standardı ve yenilikçi içerik yaklaşımıyla global ölçekte fark yaratır.": "Its scientific foundation, high quality standards and innovative ingredients make a difference worldwide.",
  "Shining Brows’un dünyada üretilen ilk ve tek Hybrid Remover formülü, güvenlik ve maksimum verim hedeflenerek geliştirildi. Kabin uygulama ve ev devam ürünleriyle profesyonel sonuçları destekler.": "Shining Brows' first and only Hybrid Remover formula was developed for safety and maximum performance. Its professional and home care products support professional results.",
  "Shining Brows Academy bünyesinde yer alan uzmanlarımızın, ortak kalite standartlarını korumak ve mesleki gelişimi desteklemek amacıyla aşağıdaki rehber doğrultusunda ilerlemesi beklenmektedir:": "Our Shining Brows Academy experts are expected to follow this guide to maintain shared quality standards and support professional development:",
  "Shining Brows sertifikası, uzmana Shining Brows ürünlerini kullanarak profesyonel uygulama yapma yetkisi sağlar. Tüm uygulamaların akademi standartlarına uygun şekilde gerçekleştirilmesi önemlidir.": "Shining Brows certification authorizes experts to perform professional treatments using Shining Brows products. All treatments should follow academy standards.",
  "Shining Brows Expert (Uzman) seviyesindeki uzmanlarımızın, bilgi ve uygulama becerilerini ileriye taşıyabilmeleri ve Master yolculuğuna devam edebilmeleri için Master Assistant yükselmeleri almaları önerilmektedir.": "Shining Brows Experts are encouraged to advance to Master Assistant to develop their knowledge and practical skills on their journey toward Master level.",
  "Master Assistant seviyesindeki uzmanlarımız, Shining Brows sistemi kapsamında Re-Teaching (pekiştirme / tekrar) verme yetkisine sahiptir. Bu süreç, bilginin doğru ve tutarlı şekilde aktarılmasını desteklemek amacıyla planlanmıştır.": "Master Assistants are authorized to provide refresher training within the Shining Brows system, supporting accurate and consistent teaching.",
  "Shining Brows Academy, 2023 yılında Güzide Korkmaz tarafından kurulmuş, Türkiye merkezli uluslararası bir güzellik akademisidir. Shining Brows markası; hem profesyonel kullanıcılar hem de işlem yaptıran danışanlar için %100 memnuniyet hedefiyle, yüksek kalite standartlarında geliştirilmiştir.": "Founded by Güzide Korkmaz in 2023, Shining Brows Academy is an international beauty academy based in Türkiye. The Shining Brows brand was developed to high quality standards, aiming for complete satisfaction for professionals and their clients.",
  "Shining Brows, dünyada üretilen ilk ve tek Hybrid Remover olma özelliğinin yanı sıra; kabin uygulama ürünleri ve ev devam ürünleriyle sektörde öncü konumunu sürdürmektedir. Yenilikçi yaklaşımı, bilimsel altyapısı ve profesyonel workshop sistemiyle global güzellik sektöründe güçlü bir yer edinmiştir.": "Alongside its first and only Hybrid Remover, Shining Brows offers professional and home care products. Its innovative approach, scientific foundation and professional workshops have established its place in the global beauty industry.",
  "Dünyanın birçok ülkesinde yer alan master trainerları ve distribütörleriyle vizyoner bir ağ oluşturan Shining Brows; ürünlerini, workshop içeriklerini ve akademi sistemini bu uygulama üzerinden sizlerle buluşturmaktadır.": "With its network of master trainers and distributors around the world, Shining Brows brings you its products, workshops and academy through this app.",
  "Shining Brows’u farklı kılan en temel unsur, ürün içeriklerinin bilimsel altyapı ile geliştirilmiş, yüksek kalite standartlarına sahip ve sektörde ilk ve tek Hybrid Remover teknolojisini sunan bir marka olmasıdır. Kabin uygulama ürünlerinden ev devam ürünlerine kadar tüm içerikler, maksimum verim ve güvenlik hedeflenerek özel olarak formüle edilmiştir.": "Shining Brows combines scientifically developed ingredients, high quality standards and its first and only Hybrid Remover technology. Professional and home care products are formulated for maximum performance and safety.",
  "Shining Brows’ta ürün kadar uzman da özeldir. Akademi bünyesinde yer alan uzmanlarımız, yalnızca sertifikalı workshop sürecinden geçen ve marka standartlarını benimseyen profesyonellerden oluşur. Bu yapı, uygulama kalitesinin dünya genelinde aynı seviyede korunmasını sağlar.": "Shining Brows values its experts as much as its products. Academy experts are professionals who have completed certified workshops and adopted the brand's standards, helping maintain consistent treatment quality worldwide.",
  "Shining Brows, uzmanlarına yalnızca teknik bilgi sunmakla kalmaz; aynı zamanda kariyer yolculuğu da sunar. Expert’ten Master Assistant’a, Master Assistant’tan Master’lığa ve distribütörlüğe uzanan bu sistem, uzmanların kendi ülkelerinde ve uluslararası platformlarda güçlü bir mesleki kimlik kazanmalarına olanak tanır.": "Shining Brows offers both technical knowledge and a career path, from Expert to Master Assistant, Master and distributor, helping experts establish their professional identity locally and internationally.",
  "Global vizyonu, güçlü akademik yapısı ve yenilikçi ürün teknolojileriyle Shining Brows; sektörde sadece tercih edilen değil, örnek alınan bir marka olmayı hedefler.": "With its global vision, strong academy and innovative product technologies, Shining Brows aims to be both a preferred brand and a model for the industry."
});
  const t = text => language === "en" ? (messages[text] || text) : text;
  window.SBLocale = { language, t };
  if (language === "tr") return;
  function translate(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (root.parentElement?.closest('script,style,[translate="no"]')) return;
      const value = root.textContent.trim().replace(/\s+/g, " ");
      if (messages[value]) root.textContent = root.textContent.replace(/\S[\s\S]*\S|\S/, messages[value]);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || root.matches('script,style,[translate="no"]')) return;
    for (const attribute of ["placeholder", "aria-label", "title"]) {
      const value = root.getAttribute(attribute);
      if (messages[value]) root.setAttribute(attribute, messages[value]);
    }
    root.childNodes.forEach(translate);
  }
  document.addEventListener("DOMContentLoaded", () => {
    translate(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "characterData") translate(record.target);
        else record.addedNodes.forEach(translate);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
